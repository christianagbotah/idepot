/**
 * Supplier invoices (Phase 4) — the AP authority of the corrected
 * purchasing model, with the PO ↔ GRN ↔ invoice 3-way match.
 *
 * Posting set (ONE transaction):
 *   supplier_invoice + lines + tax evidence + match_review_item rows
 *   + goods_receipt_line.invoiced_quantity_base counters (row-locked,
 *     deterministic order — concurrent invoices against the same GRN
 *     serialize; over-billing past the received quantity is a conflict)
 *   + GL journal: Dr GR/IR (receipt value) + Dr/Cr purchase price
 *     variance + Dr expense accounts + Dr input tax recoverable +
 *     Dr purchase expense (non-recoverable tax) / Cr accounts payable
 *   + audit + outbox
 *
 * Accounting policy (documented in docs/accounting/posting-rules.md):
 *  - inventory value is recognized at GRN time (AVCO layer at the
 *    receipt unit cost); the supplier invoice NEVER re-values stock —
 *    the invoice-vs-receipt difference posts to purchase_price_variance;
 *  - supplier invoice lines are tax-EXCLUSIVE (net prices); recoverable
 *    components post to input_tax_recoverable, non-recoverable ones to
 *    purchase_expense;
 *  - the match engine records evidence and never rewrites the invoice.
 */
import { Injectable } from '@nestjs/common';
import type {
  ApproveMatchExceptions,
  CreateSupplierInvoice,
  MatchItemDto,
  SupplierInvoiceDto,
  SupplierInvoiceLineDto,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  evaluatePriceMatch,
  formatDecimal,
  formatMoney,
  grnLineValue,
  parseMoney,
  parseQuantity,
  parseTolerancePct,
  purchaseLineNet,
  computeTaxEvidence,
  QTY_SCALE,
  type GlPurpose,
  type JournalLineSpec,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
import {
  assertStatus,
  dateCol,
  dateColNull,
  lockRow,
  pgCode,
  requireRow,
  resolveBaseQuantity,
  purchasingTolerance,
  type PurchasingPrincipal,
} from './purchasing-common.js';

@Injectable()
export class SupplierInvoiceService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sequences: DocumentSequenceService,
    private readonly finance: FinancialConfigurationService,
  ) {}

  /* ------------------------------ creation ------------------------------ */

  async createSupplierInvoice(
    principal: PurchasingPrincipal,
    dto: CreateSupplierInvoice,
  ): Promise<SupplierInvoiceDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'supplier', 'supplier', [dto.supplierId]);
      if (dto.taxInclusive === true) {
        throw new ValidationError(
          'supplier invoice lines are tax-exclusive by design (net prices); enter inclusive supplier pricing net of tax',
        );
      }

      // ---- resolve lines ----------------------------------------------
      type ResolvedLine = {
        line: CreateSupplierInvoice['lines'][number];
        quantityBase: string;
        grnLine: Record<string, unknown> | null;
        poLine: Record<string, unknown> | null;
        expenseAccountId: string | null;
        lineNet: string;
        grnValue: string;
      };
      const resolved: ResolvedLine[] = [];
      const seenGrnLines = new Set<string>();

      // lock every referenced GRN line in deterministic order FIRST
      const grnLineIds = dto.lines
        .map((l) => l.goodsReceiptLineId ?? null)
        .filter((v): v is string => v != null)
        .sort();
      const grnLines = new Map<string, Record<string, unknown>>();
      for (const id of grnLineIds) {
        grnLines.set(id, await lockRow(ctx, 'goods_receipt_line', id));
      }
      // lock every referenced PO line in deterministic order
      const poLineIds = dto.lines
        .map((l) => l.purchaseOrderLineId ?? null)
        .filter((v): v is string => v != null)
        .sort();
      const poLines = new Map<string, Record<string, unknown>>();
      for (const id of poLineIds) {
        poLines.set(id, await lockRow(ctx, 'purchase_order_line', id));
      }

      for (const line of dto.lines) {
        const isInventoryLine = line.productId != null && line.productId !== '';
        let quantityBase: string;
        let grnLine: Record<string, unknown> | null = null;
        let poLine: Record<string, unknown> | null = null;
        let expenseAccountId: string | null = null;
        let grnValue = '0';

        if (isInventoryLine) {
          // an inventory line MUST reference a goods receipt line: the GRN
          // is the stock authority, and invoice-before-receipt is
          // structurally prevented (surfaced as a validation error, never
          // a silent double-post of inventory value)
          if (line.goodsReceiptLineId == null || line.goodsReceiptLineId === '') {
            throw new ValidationError(
              `inventory line "${line.description}" must reference a goods receipt line — receive the goods first (invoice-before-receipt is not allowed)`,
            );
          }
          grnLine = grnLines.get(line.goodsReceiptLineId) ?? null;
          if (grnLine == null) throw new NotFoundError('goods_receipt_line', line.goodsReceiptLineId);
          if (seenGrnLines.has(line.goodsReceiptLineId)) {
            throw new ValidationError('duplicate goods receipt line reference — merge onto one invoice line');
          }
          seenGrnLines.add(line.goodsReceiptLineId);
          // GRN line must belong to THIS supplier
          const grn = await ctx.query<{ supplier_id: string; code: string }>(
            `SELECT supplier_id, code FROM goods_receipt WHERE id = $1`,
            [String(grnLine.goods_receipt_id)],
          );
          if (grn.rows.length === 0 || String(grn.rows[0]!.supplier_id) !== dto.supplierId) {
            throw new ValidationError('goods receipt line belongs to a different supplier');
          }
          if (line.productId !== String(grnLine.product_id)) {
            throw new ValidationError('invoice line product does not match the goods receipt line product');
          }
          // over-billing guard: cumulative invoiced ≤ received
          const received = parseQuantity(String(grnLine.received_quantity_base));
          const alreadyInvoiced = parseQuantity(String(grnLine.invoiced_quantity_base));
          const conv = await resolveBaseQuantity(ctx, {
            productId: line.productId,
            unitId: line.unitId ?? null,
            quantity: line.quantity ?? line.quantityBase ?? '1',
          });
          const billed = parseQuantity(conv.quantityBase);
          if (alreadyInvoiced + billed > received) {
            throw new ConflictError(
              `over-billing: goods receipt line has ${String(received)} base received, ${String(alreadyInvoiced)} already invoiced, invoice line bills ${conv.quantityBase}`,
            );
          }
          quantityBase = conv.quantityBase;
          grnValue = String(grnLine.line_value);
          if (line.purchaseOrderLineId != null && line.purchaseOrderLineId !== '') {
            poLine = poLines.get(line.purchaseOrderLineId) ?? null;
            if (poLine == null) throw new NotFoundError('purchase_order_line', line.purchaseOrderLineId);
          }
        } else {
          // expense line: posts to a named account (or the purchase_expense purpose)
          if (line.expenseAccountCode != null && line.expenseAccountCode !== '') {
            const acc = await ctx.query<{ id: string }>(
              `SELECT id FROM gl_account WHERE tenant_id = $1 AND code = $2 AND is_active`,
              [ctx.tenantId, line.expenseAccountCode],
            );
            if (acc.rows.length === 0) {
              throw new NotFoundError('gl_account (by code)', line.expenseAccountCode);
            }
            expenseAccountId = acc.rows[0]!.id;
          }
          quantityBase = line.quantityBase ?? '1';
        }

        const lineNet = purchaseLineNet(quantityBase, line.unitPrice, line.lineDiscount ?? '0');
        resolved.push({ line, quantityBase, grnLine, poLine, expenseAccountId, lineNet, grnValue });
      }

      // ---- tax (transaction-time evidence, statute-free engine) --------
      const tax = await this.finance.resolveTaxRules(ctx, dto.businessDate);
      const taxableBasis = resolved
        .filter((r) => r.line.taxExempt !== true)
        .reduce((s, r) => s + parseMoney(r.lineNet), 0n);
      const taxEvidence = computeTaxEvidence(
        tax.rules.map((r) => ({ ...r, recoverable: r.recoverable === true })),
        formatMoney(taxableBasis),
      );
      const subtotal = resolved.reduce((s, r) => s + parseMoney(r.lineNet), 0n);
      const total = subtotal + taxEvidence.taxAdded;

      // ---- match evaluation (evidence, never an invoice rewrite) -------
      const tolerance = await purchasingTolerance(ctx);
      const priceTol = parseTolerancePct(tolerance.priceTolerancePct);
      const valueTol = parseMoney(tolerance.valueTolerance);
      type MatchSpec = {
        dimension: string;
        severity: 'info' | 'tolerated' | 'approval_required';
        expectedValue: string | null;
        actualValue: string | null;
        variance: string | null;
        poLineId: string | null;
        grnLineId: string | null;
      };
      const matches: MatchSpec[] = [];
      let anyApproval = false;
      for (const r of resolved) {
        if (r.poLine != null) {
          const poPrice = parseMoney(String(r.poLine.unit_price));
          const invoicePrice = parseMoney(r.line.unitPrice);
          const pm = evaluatePriceMatch({
            poUnitPrice: poPrice,
            invoiceUnitPrice: invoicePrice,
            quantityBase: parseQuantity(r.quantityBase),
            tolerance: { overreceiptTolerancePct: 0n, priceTolerancePct: priceTol, valueTolerance: valueTol },
          });
          matches.push({
            dimension: 'price',
            severity: pm.severity,
            expectedValue: formatMoney(poPrice),
            actualValue: formatMoney(invoicePrice),
            variance: formatMoney(pm.varianceUnitPrice),
            poLineId: String(r.poLine.id),
            grnLineId: r.grnLine ? String(r.grnLine.id) : null,
          });
          // cumulative invoiced vs ordered
          const ordered = parseQuantity(String(r.poLine.ordered_quantity_base));
          const alreadyInvoiced = parseQuantity(String(r.poLine.invoiced_quantity_base));
          const nowInvoiced = alreadyInvoiced + parseQuantity(r.quantityBase);
          if (nowInvoiced > ordered) {
            matches.push({
              dimension: 'quantity',
              severity: 'approval_required',
              expectedValue: String(ordered),
              actualValue: String(nowInvoiced),
              variance: String(nowInvoiced - ordered),
              poLineId: String(r.poLine.id),
              grnLineId: r.grnLine ? String(r.grnLine.id) : null,
            });
          }
          if (pm.severity === 'approval_required') anyApproval = true;
        }
      }
      const hasPo = dto.purchaseOrderId != null && dto.purchaseOrderId !== '';
      const matchState = anyApproval
        ? 'exceptions_pending'
        : hasPo
          ? 'within_tolerance'
          : 'no_po';
      for (const m of matches) if (m.severity === 'approval_required') anyApproval = true;

      // ---- period lock + numbering + insert ----------------------------
      await this.finance.assertPeriodOpen(ctx, dto.businessDate);
      const code = await this.sequences.allocate(ctx, { docType: 'SUPPLIER_INVOICE' });
      let invoiceId: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO supplier_invoice
             (tenant_id, code, supplier_id, supplier_invoice_number, supplier_invoice_date, due_date,
              payment_terms, business_date, purchase_order_id, status, match_state,
              subtotal, tax_total, tax_inclusive_total, total,
              tax_profile_version_id, tax_inclusive, tax_profile_code, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false,$17,$18,$19)
           RETURNING id`,
          [
            ctx.tenantId, code, dto.supplierId, dto.supplierInvoiceNumber, dto.supplierInvoiceDate,
            dto.dueDate ?? null, dto.paymentTerms ?? null, dto.businessDate,
            dto.purchaseOrderId ?? null, 'pending_match', matchState,
            formatMoney(subtotal), formatMoney(taxEvidence.taxTotal), formatMoney(taxEvidence.taxInclusiveTotal),
            formatMoney(total), tax.versionId, tax.profileCode, dto.notes ?? null, principal.userId,
          ],
        );
        invoiceId = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError(
            `duplicate supplier invoice: supplier ${dto.supplierId} invoice number "${dto.supplierInvoiceNumber}" is already recorded`,
          );
        }
        throw err;
      }

      for (const r of resolved) {
        await ctx.query(
          `INSERT INTO supplier_invoice_line
             (tenant_id, supplier_invoice_id, goods_receipt_line_id, purchase_order_line_id,
              product_id, expense_account_id, description, unit_id, quantity, conversion_factor,
              quantity_base, unit_price, line_discount, line_net, tax_exempt, tax_basis)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            ctx.tenantId, invoiceId, r.line.goodsReceiptLineId ?? null, r.line.purchaseOrderLineId ?? null,
            r.line.productId ?? null, r.expenseAccountId, r.line.description, r.line.unitId ?? null,
            r.line.quantity ?? null, r.quantityBase !== '' ? '1' : null,
            r.quantityBase, r.line.unitPrice, r.line.lineDiscount ?? '0', r.lineNet,
            r.line.taxExempt === true, r.line.taxExempt === true ? null : r.lineNet,
          ],
        );
      }

      for (const c of taxEvidence.components) {
        await ctx.query(
          `INSERT INTO supplier_invoice_tax_component
             (tenant_id, supplier_invoice_id, component_id, component_name, rate, inclusive, recoverable, taxable_basis, tax_amount)
           VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8)`,
          [
            ctx.tenantId, invoiceId, c.componentId, c.name, c.rate, c.recoverable,
            formatMoney(c.taxableBasis), formatMoney(c.taxAmount),
          ],
        );
      }

      for (const m of matches) {
        await ctx.query(
          `INSERT INTO match_review_item
             (tenant_id, supplier_invoice_id, purchase_order_line_id, goods_receipt_line_id,
              match_dimension, expected_value, actual_value, variance, severity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            ctx.tenantId, invoiceId, m.poLineId, m.grnLineId, m.dimension,
            m.expectedValue, m.actualValue, m.variance, m.severity,
          ],
        );
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'supplier_invoice.recorded',
        entityType: 'supplier_invoice',
        entityId: invoiceId,
        details: {
          code, supplierId: dto.supplierId, supplierInvoiceNumber: dto.supplierInvoiceNumber,
          subtotal: formatMoney(subtotal), taxTotal: formatMoney(taxEvidence.taxTotal),
          total: formatMoney(total), matchState,
          matchExceptionCount: matches.filter((m) => m.severity === 'approval_required').length,
        },
      });
      await ctx.outbox.emit('SupplierInvoiceRecorded', {
        supplierInvoiceId: invoiceId, code, supplierId: dto.supplierId, total: formatMoney(total),
      });

      const dtoOut = await this.getSupplierInvoiceWithinCtx(ctx, invoiceId);
      if (dto.post === true && (matchState === 'within_tolerance' || matchState === 'no_po')) {
        return this.postSupplierInvoiceWithinCtx(ctx, principal, invoiceId, undefined, dto.simulateFailure);
      }
      return dtoOut;
    });
  }

  /* ------------------------------- posting ------------------------------- */

  /** Approves pending exceptions (when present) and posts the AP journal. */
  async postSupplierInvoice(
    principal: PurchasingPrincipal,
    invoiceId: string,
    approval?: ApproveMatchExceptions,
  ): Promise<SupplierInvoiceDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) =>
      this.postSupplierInvoiceWithinCtx(ctx, principal, invoiceId, approval),
    );
  }

  private async postSupplierInvoiceWithinCtx(
    ctx: UowContext,
    principal: PurchasingPrincipal,
    invoiceId: string,
    approval?: ApproveMatchExceptions,
    simulateFailure?: 'after_writes' | 'after_journal',
  ): Promise<SupplierInvoiceDto> {
    const inv = await lockRow(ctx, 'supplier_invoice', invoiceId);
    assertStatus('supplier_invoice', invoiceId, String(inv.status), ['pending_match', 'matched']);

    // ---- exception approval (verified server-side) ---------------------
    const pending = await ctx.query<{ id: string }>(
      `SELECT id FROM match_review_item
       WHERE supplier_invoice_id = $1 AND severity = 'approval_required' AND approved_by IS NULL`,
      [invoiceId],
    );
    if (pending.rows.length > 0) {
      if (approval == null) {
        throw new ConflictError(
          `supplier invoice has ${pending.rows.length} unapproved match exception(s) — a purchasing:approve approval with reason is required before posting`,
        );
      }
      await this.finance.verifyOverrideApprover(ctx, {
        username: approval.username,
        password: approval.password,
        requiredPermission: 'purchasing:approve',
      });
      await ctx.query(
        `UPDATE match_review_item
         SET approved_by = $3, approved_at = now(), approval_reason = $4
         WHERE supplier_invoice_id = $1 AND tenant_id = $2 AND severity = 'approval_required' AND approved_by IS NULL`,
        [invoiceId, ctx.tenantId, principal.userId, approval.reason],
      );
    }

    // ---- period lock ---------------------------------------------------
    await this.finance.assertPeriodOpen(ctx, dateCol(inv.business_date));

    // ---- load lines; update GRN/PO invoiced counters -------------------
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT * FROM supplier_invoice_line WHERE supplier_invoice_id = $1 ORDER BY created_at, id`,
      [invoiceId],
    );
    // lock grn lines in deterministic order
    const grnIds = lines.rows
      .map((l) => (l.goods_receipt_line_id ? String(l.goods_receipt_line_id) : null))
      .filter((v): v is string => v != null)
      .sort();
    const grnLines = new Map<string, Record<string, unknown>>();
    for (const id of grnIds) grnLines.set(id, await lockRow(ctx, 'goods_receipt_line', id));
    const poIds = lines.rows
      .map((l) => (l.purchase_order_line_id ? String(l.purchase_order_line_id) : null))
      .filter((v): v is string => v != null)
      .sort();
    const poLines = new Map<string, Record<string, unknown>>();
    for (const id of poIds) poLines.set(id, await lockRow(ctx, 'purchase_order_line', id));

    let grniDebit = 0n;
    let ppvDebit = 0n;
    let ppvCredit = 0n;
    const expenseLegs = new Map<string, bigint>();
    for (const l of lines.rows) {
      const qty = parseQuantity(String(l.quantity_base));
      if (l.goods_receipt_line_id != null) {
        const gl = grnLines.get(String(l.goods_receipt_line_id))!;
        const received = parseQuantity(String(gl.received_quantity_base));
        const alreadyInvoiced = parseQuantity(String(gl.invoiced_quantity_base));
        if (alreadyInvoiced + qty > received) {
          throw new ConflictError(
            `over-billing: goods receipt line ${String(gl.id)} received ${String(received)}, invoiced ${String(alreadyInvoiced)}, this invoice adds ${String(qty)}`,
          );
        }
        await ctx.query(
          `UPDATE goods_receipt_line SET invoiced_quantity_base = $3 WHERE id = $1 AND tenant_id = $2`,
          [String(gl.id), ctx.tenantId, formatDecimal(alreadyInvoiced + qty, QTY_SCALE)],
        );
        // GR/IR clears the BILLED PROPORTION of the receipt only — the
        // receipt value attributable to this invoice line, on the exact
        // same basis and rounding the GRN accrued it (round4(qty × cost)).
        // Regression: this used the FULL GRN line value, so a
        // partial-quantity (progress-billed) invoice cleared the whole
        // accrual and booked the uninvoiced remainder as a fictitious
        // favourable price variance.
        const billedReceiptValue = parseMoney(
          grnLineValue(String(l.quantity_base), String(gl.unit_cost)),
        );
        const lineNet = parseMoney(String(l.line_net));
        grniDebit += billedReceiptValue;
        if (lineNet > billedReceiptValue) ppvDebit += lineNet - billedReceiptValue;
        else ppvCredit += billedReceiptValue - lineNet;
      } else {
        const key = l.expense_account_id ? String(l.expense_account_id) : 'purchase_expense';
        expenseLegs.set(key, (expenseLegs.get(key) ?? 0n) + parseMoney(String(l.line_net)));
      }
      if (l.purchase_order_line_id != null) {
        const pl = poLines.get(String(l.purchase_order_line_id))!;
        const alreadyInvoiced = parseQuantity(String(pl.invoiced_quantity_base));
        await ctx.query(
          `UPDATE purchase_order_line SET invoiced_quantity_base = $3 WHERE id = $1 AND tenant_id = $2`,
          [String(pl.id), ctx.tenantId, formatDecimal(alreadyInvoiced + qty, QTY_SCALE)],
        );
      }
    }

    // ---- tax evidence --------------------------------------------------
    const taxComponents = await ctx.query<{
      component_name: string; recoverable: boolean; tax_amount: string;
    }>(
      `SELECT component_name, recoverable, tax_amount::text AS tax_amount
       FROM supplier_invoice_tax_component WHERE supplier_invoice_id = $1`,
      [invoiceId],
    );
    let recoverableTax = 0n;
    let nonRecoverableTax = 0n;
    for (const c of taxComponents.rows) {
      const amount = parseMoney(c.tax_amount);
      if (c.recoverable) recoverableTax += amount;
      else nonRecoverableTax += amount;
    }

    // ---- GL journal ----------------------------------------------------
    const apTotal = parseMoney(String(inv.total));
    const purposes: GlPurpose[] = ['accounts_payable', 'grni_clearing', 'purchase_price_variance', 'purchase_expense', 'input_tax_recoverable'];
    const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
    const journalLines: JournalLineSpec[] = [];
    if (grniDebit > 0n) {
      journalLines.push({
        accountId: accounts.get('grni_clearing')!,
        debit: formatMoney(grniDebit),
        memo: `supplier invoice ${String(inv.code)} — GR/IR cleared`,
      });
    }
    if (ppvDebit > 0n) {
      journalLines.push({
        accountId: accounts.get('purchase_price_variance')!,
        debit: formatMoney(ppvDebit),
        memo: `supplier invoice ${String(inv.code)} — unfavourable price variance`,
      });
    }
    if (ppvCredit > 0n) {
      journalLines.push({
        accountId: accounts.get('purchase_price_variance')!,
        credit: formatMoney(ppvCredit),
        memo: `supplier invoice ${String(inv.code)} — favourable price variance`,
      });
    }
    for (const [key, amount] of expenseLegs) {
      const accountId = key === 'purchase_expense' ? accounts.get('purchase_expense')! : key;
      journalLines.push({
        accountId,
        debit: formatMoney(amount),
        memo: `supplier invoice ${String(inv.code)} — expense`,
      });
    }
    if (recoverableTax > 0n) {
      journalLines.push({
        accountId: accounts.get('input_tax_recoverable')!,
        debit: formatMoney(recoverableTax),
        memo: `supplier invoice ${String(inv.code)} — recoverable input tax`,
      });
    }
    if (nonRecoverableTax > 0n) {
      journalLines.push({
        accountId: accounts.get('purchase_expense')!,
        debit: formatMoney(nonRecoverableTax),
        memo: `supplier invoice ${String(inv.code)} — non-recoverable tax expense`,
      });
    }
    journalLines.push({
      accountId: accounts.get('accounts_payable')!,
      credit: formatMoney(apTotal),
      memo: `supplier invoice ${String(inv.code)} — AP`,
    });
    // TEST ONLY: deterministic failure AFTER the deepest writes
    // (GRN/PO counters are already updated; the journal is next)
    if (simulateFailure === 'after_writes') {
      throw new Error('simulated failure after writes (atomicity test)');
    }
    await this.finance.postJournal(ctx, {
      sourceKind: 'supplier_invoice',
      sourceId: invoiceId,
      event: 'supplier_invoice_posted',
      description: `Supplier invoice ${String(inv.code)} (${String(inv.supplier_invoice_number)})`,
      businessDate: dateCol(inv.business_date),
      reference: String(inv.code),
      createdBy: principal.userId,
      lines: journalLines,
    });

    if (simulateFailure === 'after_journal') {
      throw new Error('simulated failure after journal (atomicity test)');
    }
    await ctx.query(
      `UPDATE supplier_invoice
       SET status = 'posted', posted_at = now(), posted_by = $3,
           match_state = CASE WHEN match_state = 'exceptions_pending' THEN 'exceptions_approved' ELSE match_state END
       WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, ctx.tenantId, principal.userId],
    );

    await ctx.audit.record({
      tenantId: ctx.tenantId,
      actorUserId: principal.userId,
      actorDisplay: principal.displayName,
      action: 'supplier_invoice.posted',
      entityType: 'supplier_invoice',
      entityId: invoiceId,
      details: {
        code: String(inv.code),
        apTotal: formatMoney(apTotal),
        grniCleared: formatMoney(grniDebit),
        ppvDebit: formatMoney(ppvDebit),
        ppvCredit: formatMoney(ppvCredit),
        recoverableTax: formatMoney(recoverableTax),
        exceptionsApproved: pending.rows.length,
      },
    });
    await ctx.outbox.emit('SupplierInvoicePosted', {
      supplierInvoiceId: invoiceId, code: String(inv.code), apTotal: formatMoney(apTotal),
    });
    return this.getSupplierInvoiceWithinCtx(ctx, invoiceId);
  }

  /* -------------------------------- reads -------------------------------- */

  async getSupplierInvoice(tenantId: string, invoiceId: string): Promise<SupplierInvoiceDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.getSupplierInvoiceWithinCtx(ctx, invoiceId));
  }

  async listSupplierInvoices(
    tenantId: string,
    filter: { supplierId?: string; status?: string; limit?: number } = {},
  ): Promise<SupplierInvoiceDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'si.tenant_id = $1';
      if (filter.supplierId) {
        params.push(filter.supplierId);
        where += ` AND si.supplier_id = $${params.length}`;
      }
      if (filter.status) {
        params.push(filter.status);
        where += ` AND si.status = $${params.length}`;
      }
      const limit = Math.min(filter.limit ?? 100, 500);
      const res = await ctx.query<{ id: string }>(
        `SELECT si.id FROM supplier_invoice si WHERE ${where}
         ORDER BY si.created_at DESC LIMIT ${limit}`,
        params,
      );
      const out: SupplierInvoiceDto[] = [];
      for (const r of res.rows) out.push(await this.getSupplierInvoiceWithinCtx(ctx, String(r.id)));
      return out;
    });
  }

  async getSupplierInvoiceWithinCtx(ctx: UowContext, invoiceId: string): Promise<SupplierInvoiceDto> {
    const inv = await requireRow<Record<string, unknown>>(ctx, 'supplier_invoice', invoiceId);
    const supplier = await ctx.query<{ name: string }>(
      `SELECT name FROM supplier WHERE id = $1`, [String(inv.supplier_id)],
    );
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT l.*, a.code AS expense_account_code
       FROM supplier_invoice_line l LEFT JOIN gl_account a ON a.id = l.expense_account_id
       WHERE l.supplier_invoice_id = $1 ORDER BY l.created_at, l.id`,
      [invoiceId],
    );
    const matches = await ctx.query<Record<string, unknown>>(
      `SELECT * FROM match_review_item WHERE supplier_invoice_id = $1 ORDER BY created_at, id`,
      [invoiceId],
    );
    // AP open = total + debit notes − credit notes − allocations
    const open = await ctx.query<{ debit_total: string; credit_total: string; allocated: string }>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM supplier_adjustment
            WHERE tenant_id = $1 AND supplier_invoice_id = $2 AND kind = 'debit_note'), 0)::text AS debit_total,
         COALESCE((SELECT SUM(amount) FROM supplier_adjustment
            WHERE tenant_id = $1 AND supplier_invoice_id = $2 AND kind = 'credit_note'), 0)::text AS credit_total,
         COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
            JOIN supplier_payment sp ON sp.id = spa.payment_id
            WHERE spa.tenant_id = $1 AND spa.supplier_invoice_id = $2), 0)::text AS allocated`,
      [ctx.tenantId, invoiceId],
    );
    const o = open.rows[0]!;
    // amountApplied = allocations + credit notes − debit notes (the share of
    // the invoice no longer open); open = total − amountApplied
    const amountAllocated =
      parseMoney(o.allocated) + parseMoney(o.credit_total) - parseMoney(o.debit_total);
    const amountOpen = parseMoney(String(inv.total)) - amountAllocated;

    const lineDtos: SupplierInvoiceLineDto[] = lines.rows.map((l) => ({
      id: String(l.id),
      goodsReceiptLineId: l.goods_receipt_line_id ? String(l.goods_receipt_line_id) : null,
      purchaseOrderLineId: l.purchase_order_line_id ? String(l.purchase_order_line_id) : null,
      productId: l.product_id ? String(l.product_id) : null,
      expenseAccountCode: l.expense_account_code ? String(l.expense_account_code) : null,
      description: String(l.description),
      quantityBase: String(l.quantity_base),
      unitPrice: String(l.unit_price),
      lineDiscount: String(l.line_discount),
      lineNet: String(l.line_net),
      taxExempt: Boolean(l.tax_exempt),
    }));
    const matchDtos: MatchItemDto[] = matches.rows.map((m) => ({
      id: String(m.id),
      matchDimension: String(m.match_dimension),
      severity: String(m.severity),
      expectedValue: m.expected_value != null ? String(m.expected_value) : null,
      actualValue: m.actual_value != null ? String(m.actual_value) : null,
      variance: m.variance != null ? String(m.variance) : null,
      approvedBy: m.approved_by ? String(m.approved_by) : null,
      approvedAt: m.approved_at ? new Date(m.approved_at as string).toISOString() : null,
      approvalReason: m.approval_reason ? String(m.approval_reason) : null,
    }));
    return {
      id: String(inv.id),
      code: String(inv.code),
      supplierId: String(inv.supplier_id),
      supplierName: supplier.rows[0]?.name ?? null,
      supplierInvoiceNumber: String(inv.supplier_invoice_number),
      supplierInvoiceDate: dateCol(inv.supplier_invoice_date),
      dueDate: dateColNull(inv.due_date),
      paymentTerms: inv.payment_terms ? String(inv.payment_terms) : null,
      businessDate: dateCol(inv.business_date),
      purchaseOrderId: inv.purchase_order_id ? String(inv.purchase_order_id) : null,
      status: String(inv.status),
      matchState: String(inv.match_state),
      subtotal: String(inv.subtotal),
      taxTotal: String(inv.tax_total),
      taxInclusiveTotal: String(inv.tax_inclusive_total),
      total: String(inv.total),
      amountAllocated: formatMoney(amountAllocated > 0n ? amountAllocated : 0n),
      amountOpen: formatMoney(amountOpen > 0n ? amountOpen : 0n),
      notes: inv.notes ? String(inv.notes) : null,
      postedAt: inv.posted_at ? new Date(inv.posted_at as string).toISOString() : null,
      createdAt: new Date(inv.created_at as string).toISOString(),
      lines: lineDtos,
      matchItems: matchDtos,
    };
  }
}
