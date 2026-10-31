import { Injectable } from '@nestjs/common';
import type {
  CommitSale,
  ListDto,
  CreditApplicationDto,
  InvoiceDto,
  InvoiceLineDto,
  InvoiceTaxComponentDto,
  PaymentDto,
  SaleLineInput,
  StockMovementDto,
  TenderDto,
} from '@idepot/contracts';
import {
  ConflictError,
  ForbiddenError,
  MONEY_SCALE,
  NotFoundError,
  ValidationError,
  addScaled,
  allocateOrderDiscount,
  computeTaxEvidence,
  convertToBaseExact,
  derivePaymentStatus,
  formatMoney,
  lineNet,
  parseMoney,
  parseQuantity,
  subScaled,
  validateTenderSet,
  TENDER_GL_PURPOSE,
  type GlPurpose,
  type JournalLineSpec,
  type TaxComponentRule,
} from '@idepot/domain';
import { hasPermission } from '@idepot/auth';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockPoster } from '../inventory/stock-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PricingRepository } from '../pricing/pricing.repository.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';

import type { SequencePrincipal } from './document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from './document-sequence.service.js';

/** Postgres SQLSTATE of a driver error, when present (23505 unique). */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export interface SalePrincipal extends SequencePrincipal {
  roles?: string[];
}

/** Internal sale input — the controller parses CommitSale; the sync apply
 *  path builds the same shape from an offline event payload and adds the
 *  device identity + source provenance. */
export type SaleInput = CommitSale & {
  deviceId?: string | null;
  source?: string;
};

export interface PostedSale {
  invoice: InvoiceDto;
  payment: PaymentDto | null;
  creditApplications: CreditApplicationDto[];
  movements: StockMovementDto[];
  /** true when the committed sale drove any on-hand negative (policy
   *  allow_backorder) — the caller raises the exception task */
  backorder: boolean;
  /** resolved price evidence per line (audit) */
  priceSources: Array<{ productId: string; source: string; overridden: boolean }>;
}

interface ResolvedLine {
  productId: string;
  unitId: string | null;
  quantity: string;
  quantityBase: string;
  unitPrice: string;
  lineNet: bigint;
  resolvedPrice: string;
  priceSource: string;
  priceOverridden: boolean;
  /** line-level OR product-level exemption (finding #1) */
  taxExempt: boolean;
  note: string | null;
  movementBase: string;
}

/**
 * The atomic sale commit (ROADMAP Phase 3 posting rule + hardening round
 * findings #1–#4). ONE UnitOfWork transaction commits:
 *
 *   invoice + lines (server-computed totals, C-1/C-2, tax identity
 *     total = subtotal − order_discount + tax_total − tax_inclusive_total)
 *   → TAX EVIDENCE (#1): the effective-dated profile version is resolved
 *     SERVER-SIDE by the transaction date; named components with
 *     inclusive/exclusive treatment and exempt applicability are computed
 *     in exact decimals and stored as immutable transaction-time evidence
 *     (invoice_tax_component rows + per-line basis) — a later configuration
 *     change can never rewrite a committed invoice
 *   → stock issue movements via StockPoster (Phase 2 conversion authority
 *     applies: the configured factor is resolved server-side and stored as
 *     evidence; stale/tampered expectations are rejected)
 *   → COGS snapshot per line (#3, ADR-0004): AVCO evidence resolved from
 *     the locked cost state inside the SAME posting (method + policy
 *     version + unit cost + line COGS stored on the line)
 *   → money tenders as a payment document + explicit allocation (C-6/C-17)
 *   → credit tenders as credit applications consuming deposits oldest-first
 *     (C-20: credit is a tender against a normal sale; totals never include
 *     credit)
 *   → GL JOURNAL (#2): one balanced entry (Σ debits == Σ credits, enforced
 *     by the domain builder AND the database constraint trigger) covering
 *     revenue, tax payable, tender control accounts, change, AR, deposits
 *     consumed and COGS — committed in the SAME transaction
 *   → audit event + outbox (InvoicePosted / PaymentReceived / CreditApplied /
 *     StockMoved / SaleBackorderException) — outbox events represent
 *     committed facts only.
 *
 * PRICE AUTHORITY (#4): the client's unitPrice is an EXPECTATION — the
 * server-resolved price is authoritative. A mismatch is a 409 stale-price
 * unless the principal holds sales:price_override and supplies override
 * evidence; a material override (beyond the tenant threshold) additionally
 * requires a supervisor whose credentials are verified server-side inside
 * this transaction. Order discounts require sales:discount_override +
 * evidence under the same threshold rule.
 *
 * Any throw rolls the WHOLE set back (zero partial state — proven by the
 * kill-mid-post atomicity tests, both before-any-write and
 * after-deepest-writes). The oversell policy is tenant-configurable
 * (offline-sync §5b): 'reject' (default) fails the sale with 409;
 * 'allow_backorder' lets the ledger arithmetic apply and raises a prominent
 * exception task.
 */
@Injectable()
export class SalePoster {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly poster: StockPoster,
    private readonly sequences: DocumentSequenceService,
    private readonly pricing: PricingRepository,
    private readonly finance: FinancialConfigurationService,
  ) {}

  commitSale(principal: SalePrincipal, input: SaleInput): Promise<PostedSale> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, (ctx) =>
      this.postSale(ctx, principal, input),
    );
  }

  /** The posting path itself — shared verbatim by the online command and the
   *  offline sync apply (offline-sync §4.4: sync never bypasses posting). */
  async postSale(ctx: UowContext, principal: SalePrincipal, input: SaleInput): Promise<PostedSale> {
    // ---- 0. tenant oversell policy + override thresholds ---------------
    const policyRes = await ctx.query<{ oversell_policy: string }>(
      `SELECT oversell_policy FROM tenant_config WHERE tenant_id = $1`,
      [ctx.tenantId],
    );
    const policy = (policyRes.rows[0]?.oversell_policy as 'reject' | 'allow_backorder') ?? 'reject';
    const thresholds = await this.finance.overrideThresholds(ctx);

    // ---- 1. references (RLS-filtered; cross-tenant == 404) --------------
    await assertTenantRefs(ctx, 'warehouse', 'warehouse', [input.warehouseId]);
    await assertTenantRefs(ctx, 'customer', 'customer', [input.customerId]);
    await assertTenantRefs(ctx, 'product', 'product', input.lines.map((l) => l.productId));
    if (input.shiftId) await this.assertOpenShift(ctx, input.shiftId, principal.userId);

    // the transaction date is SERVER time (offline business time is recorded
    // as occurred_at evidence; tax and cost resolve by the server business
    // date — never a client-supplied date)
    const todayRes = await ctx.query<{ today: string }>(`SELECT CURRENT_DATE::text AS today`);
    const businessDate = todayRes.rows[0]!.today;

    // ---- 2. resolve lines (units server-authoritative, money server-computed,
    //         price authority enforced — finding #4) ------------------------
    const resolved = await this.resolveLines(ctx, principal, input.customerId ?? null, input.lines, {
      priceThreshold: thresholds.price,
    });

    const subtotal = resolved.reduce((acc, l) => addScaled(acc, MONEY_SCALE, l.lineNet, MONEY_SCALE).value, 0n);
    const discount = parseMoney(input.orderDiscount ?? '0');
    if (discount < 0n) throw new ValidationError('order discount must be >= 0');
    if (discount > subtotal) throw new ConflictError('order discount exceeds the invoice subtotal');

    // ---- 2b. order-discount authorization (finding #4) -------------------
    if (discount > 0n) {
      const evidence = input.discountOverride ?? null;
      if (!hasPermission(principal.roles ?? [], 'sales:discount_override') || !evidence) {
        throw new ForbiddenError(
          'an order discount requires the sales:discount_override permission and recorded evidence (reason)',
        );
      }
      if (thresholds.discount > 0n && discount > thresholds.discount && !evidence.approver) {
        throw new ConflictError(
          `a discount of ${formatMoney(discount)} exceeds the tenant materiality threshold ${formatMoney(thresholds.discount)} — supervisor approval is required`,
        );
      }
      if (evidence.approver) {
        await this.finance.verifyOverrideApprover(ctx, {
          username: evidence.approver.username,
          password: evidence.approver.password,
          requiredPermission: 'sales:discount_override',
        });
      }
    }

    // ---- 2c. TAX PARTICIPANT (finding #1): server-side resolution by the
    //      transaction date + immutable evidence, computed BEFORE any write
    const discountShares = allocateOrderDiscount(resolved.map((l) => l.lineNet), discount);
    const lineBasis = resolved.map((l, i) => subScaled(l.lineNet, MONEY_SCALE, discountShares[i]!, MONEY_SCALE).value);
    let taxableBasis = 0n;
    for (let i = 0; i < resolved.length; i++) {
      if (!resolved[i]!.taxExempt) {
        taxableBasis = addScaled(taxableBasis, MONEY_SCALE, lineBasis[i]!, MONEY_SCALE).value;
      }
    }
    const tax = await this.finance.resolveTaxRules(ctx, businessDate);
    const taxRules: TaxComponentRule[] = tax.rules;
    const taxEvidence = computeTaxEvidence(taxRules, formatMoney(taxableBasis));
    const taxTotal = taxEvidence.taxTotal;
    const taxInclusiveTotal = taxEvidence.taxInclusiveTotal;
    const taxAdded = taxEvidence.taxAdded;
    const taxInclusive = taxRules.some((r) => r.inclusive);
    const total = addScaled(subScaled(subtotal, MONEY_SCALE, discount, MONEY_SCALE).value, MONEY_SCALE, taxAdded, MONEY_SCALE).value;

    // atomicity-test hook: fail INSIDE the tax participant, BEFORE any write
    if (input.simulateTaxParticipantFailure) {
      throw new Error('simulated failure inside the tax participant (atomicity test)');
    }

    // ---- 3. tenders (C-6) + credit waterfall (C-20) ----------------------
    const tenders = input.tenders ?? [];
    const creditTenders = tenders.filter((t) => t.method === 'credit');
    const moneyTenders = tenders.filter((t) => t.method !== 'credit');
    const moneyPaid = moneyTenders.reduce(
      (acc, t) => addScaled(acc, MONEY_SCALE, parseMoney(t.amount), MONEY_SCALE).value,
      0n,
    );
    const creditTotal = creditTenders.reduce(
      (acc, t) => addScaled(acc, MONEY_SCALE, parseMoney(t.amount), MONEY_SCALE).value,
      0n,
    );
    const { changeDue } = validateTenderSet(tenders, formatMoney(total));
    // allocation basis is MONEY ONLY — credit is not money, it is a deposit
    // ledger transfer (C-20); the payment document carries the money tenders
    const allocatable = moneyPaid > total ? total : moneyPaid; // min(moneyPaid, total)
    const remainingDue = subScaled(total, MONEY_SCALE, allocatable, MONEY_SCALE).value;
    if (changeDue > 0n && creditTotal > 0n) {
      throw new ValidationError('credit tenders cannot be combined with a cash overpayment');
    }
    if (creditTotal > remainingDue) {
      throw new ValidationError(
        `credit tenders (${formatMoney(creditTotal)}) exceed the remaining due after money tenders (${formatMoney(remainingDue)}) — deliberate credit must be recorded as a customer deposit`,
      );
    }

    // ---- 4. document number (booklet → counter, or validated offline lease)
    const code = await this.sequences.allocate(ctx, {
      docType: 'INVOICE',
      preallocated: input.docNumber,
      deviceId: input.deviceId ?? null,
    });

    // ---- 5. invoice (cost_total lands after the AVCO issues below) ------
    let invoiceId: string;
    try {
      const invRes = await ctx.query<Record<string, unknown>>(
        `INSERT INTO invoice
           (tenant_id, code, customer_id, warehouse_id, shift_id, status,
            subtotal, order_discount, total, change_given, source,
            client_doc_id, business_date, occurred_at, note, created_by,
            tax_profile_version_id, tax_inclusive, tax_total, tax_inclusive_total, tax_profile_code)
         VALUES ($1,$2,$3,$4,$5,'posted',$6,$7,$8,$9,$10,$11,CURRENT_DATE,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [
          ctx.tenantId,
          code,
          input.customerId ?? null,
          input.warehouseId,
          input.shiftId ?? null,
          formatMoney(subtotal),
          formatMoney(discount),
          formatMoney(total),
          formatMoney(changeDue),
          input.source ?? 'pos',
          input.clientDocId ?? null,
          input.occurredAt ?? null,
          input.note ?? null,
          principal.userId,
          tax.versionId,
          taxInclusive,
          formatMoney(taxTotal),
          formatMoney(taxInclusiveTotal),
          tax.profileCode,
        ],
      );
      invoiceId = String(invRes.rows[0]!.id);
    } catch (err) {
      // UNIQUE (tenant_id, code) / UNIQUE (tenant_id, client_doc_id)
      if (pgCode(err) === '23505') {
        throw new ConflictError(
          'duplicate sale: this document number or client document id has already been committed (reload; an offline capture must never be re-applied)',
        );
      }
      throw err;
    }

    // ---- 5b. immutable tax evidence rows (append-only) -------------------
    for (const c of taxEvidence.components) {
      await ctx.query(
        `INSERT INTO invoice_tax_component
           (tenant_id, invoice_id, component_id, component_name, rate, inclusive, taxable_basis, tax_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          ctx.tenantId,
          invoiceId,
          c.componentId,
          c.name,
          c.rate,
          c.inclusive,
          formatMoney(c.taxableBasis),
          formatMoney(c.taxAmount),
        ],
      );
    }

    // ---- 6. stock: issue movements through the coordinator's poster ------
    // (the poster locks the AVCO cost state in the same critical section and
    // returns per-movement transaction-time cost evidence — finding #3)
    const costPolicy = await this.finance.resolveCostPolicy(ctx, businessDate);
    const movements = await this.poster.post(
      ctx,
      resolved.map((l) => ({
        warehouseId: input.warehouseId,
        productId: l.productId,
        movementType: 'issue' as const,
        quantityBase: l.movementBase.startsWith('-') ? l.movementBase : `-${l.movementBase}`,
        unitId: l.unitId,
        quantityTransacted: l.unitId ? l.quantity : null,
        reason: `sale ${code}`,
      })),
      {
        sourceDocumentType: 'invoice',
        sourceDocumentId: invoiceId,
        createdBy: principal.userId,
        allowNegative: policy === 'allow_backorder',
      },
    );

    // ---- 6b. invoice lines with AVCO cost + tax basis evidence -----------
    let cogsTotal = 0n;
    const anyCost = movements.some((m) => m.costValue != null);
    for (let i = 0; i < resolved.length; i++) {
      const l = resolved[i]!;
      const movement = movements[i]!;
      const cogs = movement.costValue != null ? parseMoney(movement.costValue) : null;
      if (cogs != null) cogsTotal = addScaled(cogsTotal, MONEY_SCALE, cogs, MONEY_SCALE).value;
      await ctx.query<Record<string, unknown>>(
        `INSERT INTO invoice_line
           (tenant_id, invoice_id, product_id, unit_id, quantity, quantity_base,
            unit_price, line_net, resolved_price, price_source, price_overridden,
            cost_at_sale, note, sort_order,
            tax_exempt, tax_basis, cost_method, cost_policy_version_id, cogs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          ctx.tenantId,
          invoiceId,
          l.productId,
          l.unitId,
          l.quantity,
          l.quantityBase,
          l.unitPrice,
          formatMoney(l.lineNet),
          l.resolvedPrice,
          l.priceSource,
          l.priceOverridden,
          movement.unitCost,
          l.note,
          i,
          l.taxExempt,
          formatMoney(lineBasis[i]!),
          movement.costValue != null ? costPolicy.method : null,
          movement.costValue != null ? costPolicy.versionId : null,
          cogs != null ? formatMoney(cogs) : null,
        ],
      );
    }
    if (anyCost) {
      await ctx.query(
        `UPDATE invoice SET cost_total = $3 WHERE tenant_id = $1 AND id = $2`,
        [ctx.tenantId, invoiceId, formatMoney(cogsTotal)],
      );
    }

    // ---- 7. backorder detection (policy allow_backorder) -----------------
    let backorder = false;
    if (policy === 'allow_backorder') {
      const neg = await ctx.query<Record<string, unknown>>(
        `SELECT product_id, quantity_base::text AS quantity_base
         FROM stock_balance
         WHERE tenant_id = $1 AND warehouse_id = $2
           AND product_id = ANY($3::uuid[]) AND quantity_base < 0`,
        [ctx.tenantId, input.warehouseId, resolved.map((l) => l.productId)],
      );
      backorder = neg.rows.length > 0;
      if (backorder) {
        await ctx.audit.record({
          tenantId: ctx.tenantId,
          actorUserId: principal.userId,
          actorDisplay: principal.displayName,
          action: 'sale.backorder_exception',
          entityType: 'invoice',
          entityId: invoiceId,
          details: {
            code,
            negative: neg.rows.map((r) => ({ productId: String(r.product_id), onHand: String(r.quantity_base) })),
          },
        });
        await ctx.outbox.emit('SaleBackorderException', {
          invoiceId,
          code,
          warehouseId: input.warehouseId,
          negative: neg.rows.map((r) => ({ productId: String(r.product_id), onHand: String(r.quantity_base) })),
        });
      }
    }

    // ---- 8. payment document + explicit allocation (money tenders) -------
    let payment: PaymentDto | null = null;
    if (moneyPaid > 0n) {
      const receiptCode = await this.sequences.allocate(ctx, { docType: 'RECEIPT' });
      payment = await this.insertPaymentWithAllocation(
        ctx,
        principal,
        {
          customerId: input.customerId ?? null,
          amount: moneyPaid,
          changeGiven: changeDue,
          invoiceId,
          tenders: moneyTenders,
          shiftId: input.shiftId ?? null,
          clientDocId: null, // sale-carried payment shares the sale's identity
          source: 'sale',
          occurredAt: input.occurredAt ?? null,
          allocatable,
          receiptCode,
        },
      );
    }

    // ---- 9. credit applications (deposit waterfall, oldest first) --------
    const creditApplications: CreditApplicationDto[] = [];
    if (creditTotal > 0n) {
      if (!input.customerId) throw new ValidationError('credit tenders require a customer');
      // every credit tender must reference a deposit of THIS customer
      await assertTenantRefs(ctx, 'customer_deposit', 'customer_deposit', creditTenders.map((t) => t.depositId));
      const owned = await ctx.query<{ bad: number }>(
        `SELECT count(*)::int AS bad FROM customer_deposit
         WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND customer_id <> $3`,
        [ctx.tenantId, creditTenders.map((t) => t.depositId!), input.customerId],
      );
      if ((owned.rows[0]?.bad ?? 0) > 0) {
        throw new ValidationError('credit tenders reference a deposit that does not belong to this customer');
      }
      creditApplications.push(
        ...await this.applyCreditWaterfall(ctx, principal, input.customerId, invoiceId, creditTotal, creditTenders),
      );
    }

    // ---- 10. GL JOURNAL (finding #2): one balanced entry in the SAME tx --
    // the receivable leg is what money AND credit have NOT settled
    const arRemaining = remainingDue > creditTotal ? remainingDue - creditTotal : 0n;
    const journal = await this.postSaleJournal(ctx, principal, {
      invoiceId,
      code,
      occurredAt: input.occurredAt ?? null,
      moneyTenders,
      changeDue,
      creditTotal,
      remainingDue: arRemaining,
      revenue: subScaled(subScaled(subtotal, MONEY_SCALE, discount, MONEY_SCALE).value, MONEY_SCALE, taxInclusiveTotal, MONEY_SCALE).value,
      taxComponents: taxEvidence.components.map((c) => ({
        componentId: c.componentId,
        amount: c.taxAmount,
      })),
      cogs: cogsTotal,
    });

    // ---- 11. audit + outbox ----------------------------------------------
    const amountPaid = allocatable + creditTotal;
    await ctx.audit.record({
      tenantId: ctx.tenantId,
      actorUserId: principal.userId,
      actorDisplay: principal.displayName,
      action: 'sale.completed',
      entityType: 'invoice',
      entityId: invoiceId,
      details: {
        code,
        warehouseId: input.warehouseId,
        customerId: input.customerId ?? null,
        subtotal: formatMoney(subtotal),
        discount: formatMoney(discount),
        taxProfileCode: tax.profileCode,
        taxTotal: formatMoney(taxTotal),
        taxAdded: formatMoney(taxAdded),
        taxComponents: taxEvidence.components.length,
        cogsTotal: formatMoney(cogsTotal),
        costMethod: costPolicy.method,
        journalId: journal?.id ?? null,
        total: formatMoney(total),
        amountPaid: formatMoney(amountPaid),
        changeDue: formatMoney(changeDue),
        paymentStatus: derivePaymentStatus(total, amountPaid),
        lines: resolved.length,
        movements: movements.length,
        priceOverrides: resolved.filter((l) => l.priceOverridden).length,
        offline: input.source === 'sync',
      },
    });
    await ctx.outbox.emit('InvoicePosted', {
      invoiceId,
      code,
      total: formatMoney(total),
      amountPaid: formatMoney(amountPaid),
      paymentStatus: derivePaymentStatus(total, amountPaid),
      movementIds: movements.map((m) => m.id),
      clientDocId: input.clientDocId ?? null,
      taxTotal: formatMoney(taxTotal),
      taxAdded: formatMoney(taxAdded),
      cogsTotal: formatMoney(cogsTotal),
      journalId: journal?.id ?? null,
    });
    if (payment) {
      await ctx.outbox.emit('PaymentReceived', {
        paymentId: payment.id,
        code: payment.code,
        invoiceId,
        amount: payment.amount,
        allocations: payment.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
      });
    }
    if (creditApplications.length > 0) {
      await ctx.outbox.emit('CreditApplied', {
        invoiceId,
        applications: creditApplications.map((a) => ({ depositId: a.depositId, amount: a.amount })),
      });
    }
    await ctx.outbox.emit('StockMoved', {
      sourceDocumentType: 'invoice',
      sourceDocumentId: invoiceId,
      movementIds: movements.map((m) => m.id),
    });

    // ---- 11b. atomicity-test hook: fail AFTER the deepest partial writes --
    // (a plain Error — an INTERNAL failure, mapped to 'rejected' by the sync
    // engine and to 500 by the HTTP filter; a conflict is a BUSINESS outcome)
    if (input.simulateFailureAfterWrites) {
      throw new Error('simulated failure after partial writes (atomicity test)');
    }

    const invoice = await this.loadInvoice(ctx, invoiceId);
    return {
      invoice,
      payment,
      creditApplications,
      movements,
      backorder,
      priceSources: resolved.map((l) => ({
        productId: l.productId,
        source: l.priceSource,
        overridden: l.priceOverridden,
      })),
    };
  }

  /**
   * The sale journal (finding #2) — one balanced entry covering the whole
   * posting set, committed in the caller's transaction:
   *
   *   DR  tender control accounts (gross money tenders)
   *   DR  customer deposits (credit consumed)      CR  sales revenue (net)
   *   DR  accounts receivable (remaining due)      CR  tax payable (per component)
   *   DR  cost of goods sold                       CR  cash (change given)
   *                                                CR  inventory (AVCO COGS)
   *
   * Algebraic identity: Σ debits = moneyPaid + creditTotal + arRemaining =
   * max(total, moneyPaid) and Σ credits = revenue + taxTotal + changeDue +
   * COGS-side inventory = total + changeDue + COGS — equal in both the exact
   * and the overpaid case (arRemaining = total − allocatable − creditTotal,
   * the share settled by NEITHER money nor deposit credit).
   */
  private async postSaleJournal(
    ctx: UowContext,
    principal: SalePrincipal,
    args: {
      invoiceId: string;
      code: string;
      occurredAt: string | null;
      moneyTenders: TenderDto[];
      changeDue: bigint;
      creditTotal: bigint;
      remainingDue: bigint;
      revenue: bigint;
      taxComponents: Array<{ componentId: string | null; amount: bigint }>;
      cogs: bigint;
    },
  ): Promise<{ id: string; totalDebit: string; totalCredit: string } | null> {
    const purposes: GlPurpose[] = [
      'sales_revenue', 'tax_payable', 'accounts_receivable', 'customer_deposit_liability', 'cogs', 'inventory', 'cash',
    ];
    for (const t of args.moneyTenders) {
      const purpose = TENDER_GL_PURPOSE[t.method];
      if (purpose && !purposes.includes(purpose)) purposes.push(purpose);
    }
    const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
    const componentOverrides = await this.finance.componentAccountOverrides(
      ctx,
      args.taxComponents.map((c) => c.componentId),
    );

    // aggregate tax legs per payable account (components may share one)
    const taxLegs = new Map<string, bigint>();
    for (const c of args.taxComponents) {
      const account =
        (c.componentId != null ? componentOverrides.get(c.componentId) : undefined) ??
        accounts.get('tax_payable')!;
      taxLegs.set(account, addScaled(taxLegs.get(account) ?? 0n, MONEY_SCALE, c.amount, MONEY_SCALE).value);
    }

    const lines: JournalLineSpec[] = [];
    for (const t of args.moneyTenders) {
      const purpose = TENDER_GL_PURPOSE[t.method];
      if (!purpose) throw new ValidationError(`tender method "${t.method}" has no GL control account`);
      lines.push({
        accountId: accounts.get(purpose)!,
        debit: formatMoney(parseMoney(t.amount)),
        memo: `sale ${args.code} tender ${t.method}`,
      });
    }
    lines.push({ accountId: accounts.get('customer_deposit_liability')!, debit: formatMoney(args.creditTotal), memo: `sale ${args.code} deposits consumed` });
    lines.push({ accountId: accounts.get('accounts_receivable')!, debit: formatMoney(args.remainingDue), memo: `sale ${args.code} receivable` });
    lines.push({ accountId: accounts.get('sales_revenue')!, credit: formatMoney(args.revenue), memo: `sale ${args.code} net revenue` });
    for (const [accountId, amount] of taxLegs) {
      lines.push({ accountId, credit: formatMoney(amount), memo: `sale ${args.code} tax` });
    }
    lines.push({ accountId: accounts.get('cash')!, credit: formatMoney(args.changeDue), memo: `sale ${args.code} change given` });
    lines.push({ accountId: accounts.get('cogs')!, debit: formatMoney(args.cogs), memo: `sale ${args.code} COGS` });
    lines.push({ accountId: accounts.get('inventory')!, credit: formatMoney(args.cogs), memo: `sale ${args.code} inventory issued` });

    return this.finance.postJournal(ctx, {
      sourceKind: 'invoice',
      sourceId: args.invoiceId,
      event: 'sale_posted',
      description: `Sale ${args.code}`,
      occurredAt: args.occurredAt,
      createdBy: principal.userId,
      lines,
    });
  }

  /**
   * Insert the payment header + tenders + ONE explicit allocation row for
   * the sale's invoice. The payment_allocation_guard trigger enforces
   * invariant 8 (Σ allocations ≤ amount − change − unapplied) at the DB.
   */
  async insertPaymentWithAllocation(
    ctx: UowContext,
    principal: SalePrincipal,
    args: {
      customerId: string | null;
      amount: bigint;
      changeGiven: bigint;
      invoiceId: string | null;
      tenders: TenderDto[];
      shiftId: string | null;
      clientDocId: string | null;
      source: string;
      occurredAt: string | null;
      /** amount of this payment to allocate to the sale invoice */
      allocatable?: bigint;
      receiptCode: string;
    },
  ): Promise<PaymentDto> {
    const payRes = await ctx.query<Record<string, unknown>>(
      `INSERT INTO payment
         (tenant_id, code, customer_id, amount, change_given, unapplied,
          shift_id, source, client_doc_id, business_date, occurred_at, created_by)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,CURRENT_DATE,$9,$10)
       RETURNING id`,
      [
        ctx.tenantId,
        args.receiptCode,
        args.customerId,
        formatMoney(args.amount),
        formatMoney(args.changeGiven),
        args.shiftId,
        args.source,
        args.clientDocId,
        args.occurredAt,
        principal.userId,
      ],
    );
    const paymentId = String(payRes.rows[0]!.id);
    for (const t of args.tenders) {
      await ctx.query(
        `INSERT INTO payment_tender
           (tenant_id, payment_id, method, amount, momo_provider, momo_phone,
            momo_transaction_id, cheque_bank, cheque_branch, cheque_number, reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          ctx.tenantId,
          paymentId,
          t.method,
          t.amount,
          t.momoProvider ?? null,
          t.momoPhone ?? null,
          t.momoTransactionId ?? null,
          t.chequeBank ?? null,
          t.chequeBranch ?? null,
          t.chequeNumber ?? null,
          t.reference ?? null,
        ],
      );
    }
    if (args.invoiceId && args.allocatable != null && args.allocatable > 0n) {
      try {
        await ctx.query(
          `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_id, amount)
           VALUES ($1,$2,$3,$4)`,
          [ctx.tenantId, paymentId, args.invoiceId, formatMoney(args.allocatable)],
        );
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError('this payment is already allocated to this invoice');
        }
        throw err;
      }
    }
    return this.loadPayment(ctx, paymentId);
  }

  /**
   * C-20 corrected credit waterfall: consume deposits oldest-first under
   * FOR UPDATE, writing one credit_application row per (deposit, invoice)
   * touch. The deposit ledger and the application rows commit in the SAME
   * transaction as the sale (legacy wrote disbursements across separate
   * statements — crashes left credits half-spent).
   */
  async applyCreditWaterfall(
    ctx: UowContext,
    principal: SalePrincipal,
    customerId: string,
    invoiceId: string,
    amount: bigint,
    tenders: TenderDto[],
  ): Promise<CreditApplicationDto[]> {
    let remaining = amount;
    const out: CreditApplicationDto[] = [];
    // Serialize credit consumption per customer: customer_deposit is
    // append-only for the app role (no UPDATE grant), so row locking with
    // FOR UPDATE is unavailable (it requires UPDATE privilege). A
    // transaction-scoped advisory lock gives the same serialization: two
    // concurrent credit applications for the same customer commit one after
    // the other and the remaining-balance re-read below is always current.
    await ctx.query(
      `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
      [`customer-credit:${ctx.tenantId}:${customerId}`],
    );
    // read open deposits in deterministic (oldest-first) order
    const deposits = await ctx.query<Record<string, unknown>>(
      `SELECT d.id, d.code, d.amount
       FROM customer_deposit d
       WHERE d.tenant_id = $1 AND d.customer_id = $2
       ORDER BY d.created_at, d.id`,
      [ctx.tenantId, customerId],
    );
    // remaining per deposit = amount − Σ applications (committed + this tx)
    const applied = await ctx.query<{ deposit_id: string; applied: string }>(
      `SELECT deposit_id, COALESCE(SUM(amount),0)::text AS applied
       FROM credit_application
       WHERE tenant_id = $1 AND deposit_id = ANY($2::uuid[])
       GROUP BY deposit_id`,
      [ctx.tenantId, deposits.rows.map((d) => String(d.id))],
    );
    const appliedByDeposit = new Map(applied.rows.map((r) => [r.deposit_id, BigInt(r.applied)]));

    for (const d of deposits.rows) {
      if (remaining <= 0n) break;
      const depositId = String(d.id);
      const depositAmount = BigInt(parseMoney(String(d.amount)));
      const already = appliedByDeposit.get(depositId) ?? 0n;
      const available = depositAmount - already;
      if (available <= 0n) continue;
      const take = available < remaining ? available : remaining;
      try {
        const res = await ctx.query<Record<string, unknown>>(
          `INSERT INTO credit_application (tenant_id, deposit_id, invoice_id, amount)
           VALUES ($1,$2,$3,$4)
           RETURNING id, created_at`,
          [ctx.tenantId, depositId, invoiceId, formatMoney(take)],
        );
        const row = res.rows[0]!;
        out.push({
          id: String(row.id),
          depositId,
          depositCode: String(d.code),
          invoiceId,
          invoiceCode: null,
          amount: formatMoney(take),
          createdAt: new Date(row.created_at as string).toISOString(),
        });
        remaining -= take;
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError('this deposit is already applied to this invoice');
        }
        throw err;
      }
    }
    if (remaining > 0n) {
      throw new ConflictError(
        `customer deposits exhausted: ${formatMoney(remaining)} of credit could not be applied`,
      );
    }
    // tender-level evidence: the credit tenders reference the deposits they
    // consumed (validated by validateTender); the applications are the ledger
    void tenders;
    void principal;
    return out;
  }

  /* ------------------------------ resolution ------------------------------ */

  /**
   * Resolves every sale line with SERVER authority:
   * - units/conversions resolved from configuration (Phase 2 semantics);
   * - the server price is AUTHORITATIVE (finding #4): a client price that
   *   disagrees is a 409 stale-price unless the principal holds
   *   sales:price_override AND supplies override evidence; a material
   *   override (|Δ| beyond the tenant threshold) additionally requires a
   *   supervisor whose credentials verify server-side in this transaction;
   * - product-level tax exemption ORs with the line-level flag (finding #1).
   */
  private async resolveLines(
    ctx: UowContext,
    principal: SalePrincipal,
    customerId: string | null,
    lines: SaleLineInput[],
    opts: { priceThreshold: bigint },
  ): Promise<ResolvedLine[]> {
    const canOverride = hasPermission(principal.roles ?? [], 'sales:price_override');
    const out: ResolvedLine[] = [];
    for (const line of lines) {
      const hasUnit = line.unitId != null && line.unitId !== '';
      const hasTransacted = line.quantityTransacted != null && line.quantityTransacted !== '';
      if (hasUnit !== hasTransacted) {
        throw new ValidationError(
          'cross-unit sale lines require unitId and quantityTransacted together (base-unit lines take quantityBase only)',
        );
      }

      // RLS-filtered product load
      const prodRes = await ctx.query<Record<string, unknown>>(
        `SELECT id, base_unit_id, tax_exempt
         FROM product WHERE id = $1`,
        [line.productId],
      );
      if (prodRes.rows.length === 0) throw new NotFoundError('product', line.productId);
      const product = prodRes.rows[0]!;
      const baseUnitId = String(product.base_unit_id);

      let unitId: string | null = null;
      let quantity: string;
      let factor: string;
      if (hasUnit) {
        unitId = line.unitId!;
        quantity = line.quantityTransacted!;
        if (unitId === baseUnitId) {
          factor = '1';
        } else {
          const cfg = await ctx.query<{ conversion_factor: string }>(
            `SELECT conversion_factor::text AS conversion_factor FROM product_unit
             WHERE product_id = $1 AND unit_id = $2`,
            [line.productId, unitId],
          );
          if (cfg.rows.length === 0) {
            throw new NotFoundError('product_unit configuration', `${line.productId}/${unitId}`);
          }
          factor = cfg.rows[0]!.conversion_factor;
        }
        if (line.conversionFactor != null && line.conversionFactor !== '') {
          // the client factor is an OPTIMISTIC EXPECTATION (Phase 2 review
          // fix 3 semantics): a stale/tampered factor is a 409, never posted
          let clientFactor: bigint;
          let configured: bigint;
          try {
            clientFactor = parseQuantity(line.conversionFactor);
            configured = parseQuantity(factor);
          } catch {
            throw new ValidationError(`conversion factor "${line.conversionFactor}" is not a decimal value`);
          }
          if (clientFactor !== configured) {
            throw new ConflictError(
              `stale conversion configuration: client sent factor ${line.conversionFactor} but the configured factor is ${factor} (reload and retry)`,
            );
          }
        }
      } else {
        quantity = line.quantityBase!;
        factor = '1';
      }
      if (parseQuantity(quantity) === 0n) {
        throw new ValidationError('sale quantity must be non-zero');
      }
      if (parseQuantity(quantity) < 0n) {
        throw new ValidationError('sale quantity must be >= 0');
      }

      const quantityBase = hasUnit ? convertToBaseExact(quantity, factor) : quantity;
      const clientPrice = parseMoney(line.unitPrice);

      // resolved price evidence (same precedence as the pricing module)
      const priceUnit = unitId ?? baseUnitId;
      const resolvedPrice = await this.pricing.resolveRaw({
        productId: line.productId,
        unitId: priceUnit,
        customerId: customerId ?? undefined,
      });
      const serverPrice = parseMoney(resolvedPrice.price);
      const overridden = clientPrice !== serverPrice;

      if (overridden) {
        // PRICE AUTHORITY (finding #4): without the permission + evidence a
        // mismatched price is a stale-price conflict, never a posted override
        const evidence = line.priceOverride ?? null;
        if (!canOverride || !evidence) {
          throw new ConflictError(
            `stale price: client sent ${line.unitPrice} but the server-resolved price is ${resolvedPrice.price} for product ${line.productId} (reload; overriding requires the sales:price_override permission and recorded evidence)`,
          );
        }
        const delta = clientPrice > serverPrice ? clientPrice - serverPrice : serverPrice - clientPrice;
        if (opts.priceThreshold > 0n && delta > opts.priceThreshold && !evidence.approver) {
          throw new ConflictError(
            `price override of ${formatMoney(delta)} exceeds the tenant materiality threshold ${formatMoney(opts.priceThreshold)} — supervisor approval is required`,
          );
        }
        if (evidence.approver) {
          await this.finance.verifyOverrideApprover(ctx, {
            username: evidence.approver.username,
            password: evidence.approver.password,
            requiredPermission: 'sales:price_override',
          });
        }
      }

      out.push({
        productId: line.productId,
        unitId,
        quantity,
        quantityBase,
        unitPrice: line.unitPrice,
        lineNet: lineNet(quantity, line.unitPrice),
        resolvedPrice: resolvedPrice.price,
        priceSource: resolvedPrice.source,
        priceOverridden: overridden,
        taxExempt: Boolean(product.tax_exempt) || Boolean(line.taxExempt),
        note: line.note ?? null,
        movementBase: quantityBase,
      });
    }
    return out;
  }

  private async assertOpenShift(ctx: UowContext, shiftId: string, userId: string): Promise<void> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT id, user_id, status FROM cashier_shift WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [shiftId, ctx.tenantId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('shift', shiftId);
    if (String(row.status) !== 'open') throw new ConflictError('shift is closed');
    if (String(row.user_id) !== userId) {
      throw new ForbiddenError('sales can only commit on the open shift of the signed-in cashier');
    }
  }

  /* --------------------------------- reads -------------------------------- */

  async getInvoice(tenantId: string, invoiceId: string): Promise<InvoiceDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.loadInvoice(ctx, invoiceId));
  }

  async listInvoices(tenantId: string, opts: { customerId?: string; warehouseId?: string; limit?: number } = {}): Promise<ListDto<InvoiceDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'i.tenant_id = $1';
      if (opts.customerId) {
        params.push(opts.customerId);
        where += ` AND i.customer_id = $${params.length}`;
      }
      if (opts.warehouseId) {
        params.push(opts.warehouseId);
        where += ` AND i.warehouse_id = $${params.length}`;
      }
      const limit = Math.min(opts.limit ?? 100, 500);
      const res = await ctx.query<{ id: string }>(
        `SELECT i.id FROM invoice i WHERE ${where} ORDER BY i.created_at DESC, i.id DESC LIMIT ${limit}`,
        params,
      );
      const items: InvoiceDto[] = [];
      for (const r of res.rows) items.push(await this.loadInvoice(ctx, r.id));
      return { items, total: items.length };
    });
  }

  async loadInvoice(ctx: UowContext, invoiceId: string): Promise<InvoiceDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT i.id, i.code, i.sales_order_id, i.customer_id, c.name AS customer_name,
              i.warehouse_id, i.status, i.subtotal::text AS subtotal,
              i.order_discount::text AS order_discount, i.total::text AS total,
              i.cost_total::text AS cost_total, i.change_given::text AS change_given,
              i.shift_id, i.source, i.client_doc_id, i.note, i.created_by, i.created_at,
              i.tax_profile_code, i.tax_inclusive,
              i.tax_total::text AS tax_total, i.tax_inclusive_total::text AS tax_inclusive_total
       FROM invoice i
       LEFT JOIN customer c ON c.id = i.customer_id
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [invoiceId, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('invoice', invoiceId);
    const h = res.rows[0]!;
    const linesRes = await ctx.query<Record<string, unknown>>(
      `SELECT id, product_id, unit_id, quantity::text AS quantity,
              quantity_base::text AS quantity_base, unit_price::text AS unit_price,
              line_net::text AS line_net, resolved_price::text AS resolved_price,
              price_source, price_overridden, cost_at_sale::text AS cost_at_sale,
              note, sort_order, tax_exempt, tax_basis::text AS tax_basis,
              cost_method, cogs::text AS cogs
       FROM invoice_line WHERE invoice_id = $1 ORDER BY sort_order, id`,
      [invoiceId],
    );
    const lines: InvoiceLineDto[] = linesRes.rows.map((r) => ({
      id: String(r.id),
      productId: String(r.product_id),
      unitId: r.unit_id ? String(r.unit_id) : null,
      quantity: String(r.quantity),
      quantityBase: String(r.quantity_base),
      unitPrice: String(r.unit_price),
      lineNet: String(r.line_net),
      resolvedPrice: r.resolved_price != null ? String(r.resolved_price) : null,
      priceSource: r.price_source ? String(r.price_source) : null,
      priceOverridden: Boolean(r.price_overridden),
      costAtSale: r.cost_at_sale != null ? String(r.cost_at_sale) : null,
      note: r.note ? String(r.note) : null,
      taxExempt: Boolean(r.tax_exempt),
      taxBasis: r.tax_basis != null ? String(r.tax_basis) : null,
      costMethod: r.cost_method ? String(r.cost_method) : null,
      cogs: r.cogs != null ? String(r.cogs) : null,
    }));

    // immutable transaction-time tax evidence (finding #1)
    const taxRes = await ctx.query<Record<string, unknown>>(
      `SELECT id, component_id, component_name, rate::text AS rate, inclusive,
              taxable_basis::text AS taxable_basis, tax_amount::text AS tax_amount
       FROM invoice_tax_component WHERE invoice_id = $1
       ORDER BY inclusive, component_name`,
      [invoiceId],
    );
    const taxComponents: InvoiceTaxComponentDto[] = taxRes.rows.map((r) => ({
      id: String(r.id),
      componentId: r.component_id ? String(r.component_id) : null,
      name: String(r.component_name),
      rate: String(r.rate),
      inclusive: Boolean(r.inclusive),
      taxableBasis: String(r.taxable_basis),
      taxAmount: String(r.tax_amount),
    }));

    // AR subledger derivation (C-16/C-17): paid = Σ allocations + Σ credits
    const allocRes = await ctx.query<{ paid: string }>(
      `SELECT
         (COALESCE((SELECT SUM(a.amount) FROM payment_allocation a WHERE a.tenant_id = $1 AND a.invoice_id = $2), 0)
        + COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.tenant_id = $1 AND ca.invoice_id = $2), 0))::text AS paid`,
      [ctx.tenantId, invoiceId],
    );
    const amountPaid = parseMoney(allocRes.rows[0]!.paid);
    const total = parseMoney(String(h.total));
    const amountDue = total > amountPaid ? total - amountPaid : 0n;
    const taxTotal = parseMoney(String(h.tax_total));
    const taxInclusiveTotal = parseMoney(String(h.tax_inclusive_total));

    return {
      id: String(h.id),
      code: String(h.code),
      salesOrderId: h.sales_order_id ? String(h.sales_order_id) : null,
      customerId: h.customer_id ? String(h.customer_id) : null,
      customerName: h.customer_name ? String(h.customer_name) : null,
      warehouseId: String(h.warehouse_id),
      status: String(h.status) as InvoiceDto['status'],
      paymentStatus: derivePaymentStatus(total, amountPaid),
      subtotal: String(h.subtotal),
      orderDiscount: String(h.order_discount),
      total: String(h.total),
      amountPaid: formatMoney(amountPaid),
      amountDue: formatMoney(amountDue),
      costTotal: h.cost_total != null ? String(h.cost_total) : null,
      changeGiven: String(h.change_given),
      shiftId: h.shift_id ? String(h.shift_id) : null,
      source: String(h.source),
      clientDocId: h.client_doc_id ? String(h.client_doc_id) : null,
      note: h.note ? String(h.note) : null,
      taxProfileCode: h.tax_profile_code ? String(h.tax_profile_code) : null,
      taxInclusive: Boolean(h.tax_inclusive),
      taxTotal: String(h.tax_total),
      taxAdded: formatMoney(taxTotal - taxInclusiveTotal),
      taxComponents,
      lines,
      createdBy: h.created_by ? String(h.created_by) : null,
      createdAt: new Date(h.created_at as string).toISOString(),
    };
  }

  async loadPayment(ctx: UowContext, paymentId: string): Promise<PaymentDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT p.id, p.code, p.customer_id, c.name AS customer_name,
              p.amount::text AS amount, p.change_given::text AS change_given,
              p.unapplied::text AS unapplied, p.shift_id, p.client_doc_id,
              p.source, p.created_by, p.created_at
       FROM payment p
       LEFT JOIN customer c ON c.id = p.customer_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [paymentId, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('payment', paymentId);
    const h = res.rows[0]!;
    const tendersRes = await ctx.query<Record<string, unknown>>(
      `SELECT id, method, amount::text AS amount, momo_provider, momo_phone,
              momo_transaction_id, cheque_bank, cheque_branch, cheque_number, reference
       FROM payment_tender WHERE payment_id = $1 ORDER BY created_at, id`,
      [paymentId],
    );
    const allocRes = await ctx.query<Record<string, unknown>>(
      `SELECT a.id, a.invoice_id, a.amount::text AS amount, i.code AS invoice_code
       FROM payment_allocation a
       LEFT JOIN invoice i ON i.id = a.invoice_id
       WHERE a.payment_id = $1 ORDER BY a.created_at, a.id`,
      [paymentId],
    );
    return {
      id: String(h.id),
      code: String(h.code),
      customerId: h.customer_id ? String(h.customer_id) : null,
      customerName: h.customer_name ? String(h.customer_name) : null,
      amount: String(h.amount),
      changeGiven: String(h.change_given),
      unapplied: String(h.unapplied),
      shiftId: h.shift_id ? String(h.shift_id) : null,
      clientDocId: h.client_doc_id ? String(h.client_doc_id) : null,
      source: String(h.source),
      createdBy: h.created_by ? String(h.created_by) : null,
      createdAt: new Date(h.created_at as string).toISOString(),
      tenders: tendersRes.rows.map((t) => ({
        id: String(t.id),
        method: String(t.method) as 'cash' | 'momo' | 'cheque' | 'bank_transfer' | 'credit',
        amount: String(t.amount),
        momoProvider: t.momo_provider ? String(t.momo_provider) : null,
        momoPhone: t.momo_phone ? String(t.momo_phone) : null,
        momoTransactionId: t.momo_transaction_id ? String(t.momo_transaction_id) : null,
        chequeBank: t.cheque_bank ? String(t.cheque_bank) : null,
        chequeBranch: t.cheque_branch ? String(t.cheque_branch) : null,
        chequeNumber: t.cheque_number ? String(t.cheque_number) : null,
        reference: t.reference ? String(t.reference) : null,
      })),
      allocations: allocRes.rows.map((a) => ({
        id: String(a.id),
        invoiceId: String(a.invoice_id),
        invoiceCode: a.invoice_code ? String(a.invoice_code) : null,
        amount: String(a.amount),
      })),
    };
  }
}
