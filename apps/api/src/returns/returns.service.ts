/**
 * Returns module — the Phase 5 return-order lifecycle service.
 *
 * FINANCIAL POSTING RULE: the `process` transition commits every
 * authoritative effect of a return through ONE UnitOfWork transaction:
 * credit-note document + transaction-time tax evidence + stock
 * disposition movements (original cost evidence) + the balanced GL
 * journal + store-credit issuance + return-order lifecycle update +
 * audit + outbox. Nothing is ever posted asynchronously.
 *
 * The original invoice is NEVER edited. Every effect is an append-only
 * correction document (ADR-0001 posting coordinator; ADR-0004 cost
 * evidence). The original invoice stays fully traceable to every
 * return against it (idx + drilldown reads).
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateReturn,
  CreateReturnReason,
  ReturnOrderDto,
  ReturnReasonDto,
  ReturnableInvoiceDto,
  UpdateReturnReason,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  IdempotencyKeyReuseError,
  decomposeCredit,
  dispositionRestocks,
  prorateCumulative,
  prorateMoney,
  returnRequestFingerprint,
  assertReturnTransition,
  parseMoney,
  formatMoney,
  parseQuantity,
  formatQuantity,
  halfEvenDiv,
  type JournalLineSpec,
  type GlPurpose,
  type ReturnStatus,
  type MovementEntry,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockPoster } from '../inventory/stock-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
import {
  dateCol,
  tsCol,
  tsColNull,
  lockReturnIdemDomain,
  lockReturnInvoiceDomain,
  mapUniqueViolation,
  loadInvoiceSettlement,
  type ReturnsPrincipal,
} from './returns-common.js';

interface ReturnRow {
  id: string;
  code: string;
  invoice_id: string;
  customer_id: string;
  warehouse_id: string;
  status: ReturnStatus;
  reason_id: string | null;
  credit_disposition: 'refund' | 'store_credit';
  adjustment_amount: string;
  customer_note: string | null;
  internal_note: string | null;
  gross_credit: string | null;
  ar_amount: string | null;
  refund_amount: string | null;
  store_credit_amount: string | null;
  cogs_reversal: string | null;
  credit_note_id: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  auto_approved: boolean | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  received_by: string | null;
  received_at: Date | null;
  inspection_note: string | null;
  processed_by: string | null;
  processed_at: Date | null;
  completed_at: Date | null;
  client_doc_id: string | null;
  request_fingerprint: string | null;
  business_date: Date;
  created_by: string;
  created_at: Date;
}

interface ReturnLineRow {
  id: string;
  invoice_line_id: string;
  product_id: string;
  unit_id: string | null;
  quantity: string;
  quantity_base: string;
  condition: string;
  disposition: string;
  restock_warehouse_id: string | null;
  reason_id: string | null;
  unit_price: string;
  line_net: string;
  order_discount_share: string;
  effective_net: string;
  cost_at_sale: string | null;
  cogs_at_sale: string | null;
  note: string | null;
}

/** Invoice line evidence needed for credit math. */
interface InvoiceLineEvidence {
  id: string;
  product_id: string;
  unit_id: string | null;
  quantity: string;
  quantity_base: string;
  unit_price: string;
  line_net: string;
  cost_at_sale: string | null;
  cogs: string | null;
  product_code: string | null;
  product_name: string | null;
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finance: FinancialConfigurationService,
    private readonly stockPoster: StockPoster,
    private readonly sequences: DocumentSequenceService,
  ) {}

  // =========================================================================
  // Return reasons — configurable policy
  // =========================================================================

  async listReasons(tenantId: string): Promise<ReturnReasonDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const r = await ctx.query(`
        SELECT id, code, name, requires_approval, refund_permitted, replacement_permitted,
               store_credit_permitted, restock_permitted, inspection_required, evidence_required,
               refund_deadline_days, is_active, sort_order
          FROM return_reason WHERE tenant_id = $1
         ORDER BY sort_order, code`, [ctx.tenantId]);
      return r.rows.map((row: Record<string, unknown>) => this.mapReason(row));
    });
  }

  async createReason(principal: ReturnsPrincipal, dto: CreateReturnReason): Promise<ReturnReasonDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      try {
        await ctx.query(
          `INSERT INTO return_reason (tenant_id, code, name, requires_approval, refund_permitted,
             replacement_permitted, store_credit_permitted, restock_permitted, inspection_required,
             evidence_required, refund_deadline_days, is_active, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)`,
          [
            principal.tenantId, dto.code, dto.name, dto.requiresApproval, dto.refundPermitted,
            dto.replacementPermitted, dto.storeCreditPermitted, dto.restockPermitted,
            dto.inspectionRequired, dto.evidenceRequired, dto.refundDeadlineDays ?? null, dto.sortOrder,
          ],
        );
      } catch (err) {
        mapUniqueViolation(err, `return reason code '${dto.code}' already exists`);
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'return_reason.created',
        entityType: 'return_reason',
        entityId: dto.code,
        details: { code: dto.code, name: dto.name, requiresApproval: dto.requiresApproval },
      });
      const row = await ctx.query(`SELECT * FROM return_reason WHERE tenant_id = $1 AND code = $2`, [
        principal.tenantId, dto.code,
      ]);
      return this.mapReason(row.rows[0]!);
    });
  }

  async updateReason(
    principal: ReturnsPrincipal,
    reasonId: string,
    dto: UpdateReturnReason,
  ): Promise<ReturnReasonDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const current = await ctx.query(`SELECT * FROM return_reason WHERE id = $1`, [reasonId]);
      if (current.rows.length === 0) throw new NotFoundError('return reason', reasonId);
      const before = current.rows[0] as Record<string, unknown>;
      await ctx.query(
        `UPDATE return_reason SET
           name = COALESCE($2, name),
           requires_approval = COALESCE($3, requires_approval),
           refund_permitted = COALESCE($4, refund_permitted),
           replacement_permitted = COALESCE($5, replacement_permitted),
           store_credit_permitted = COALESCE($6, store_credit_permitted),
           restock_permitted = COALESCE($7, restock_permitted),
           inspection_required = COALESCE($8, inspection_required),
           evidence_required = COALESCE($9, evidence_required),
           refund_deadline_days = COALESCE($10, refund_deadline_days),
           is_active = COALESCE($11, is_active),
           sort_order = COALESCE($12, sort_order),
           updated_at = now()
         WHERE id = $1`,
        [
          reasonId, dto.name ?? null, dto.requiresApproval ?? null, dto.refundPermitted ?? null,
          dto.replacementPermitted ?? null, dto.storeCreditPermitted ?? null,
          dto.restockPermitted ?? null, dto.inspectionRequired ?? null, dto.evidenceRequired ?? null,
          dto.refundDeadlineDays === undefined ? null : dto.refundDeadlineDays,
          dto.isActive ?? null, dto.sortOrder ?? null,
        ],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'return_reason.updated',
        entityType: 'return_reason',
        entityId: reasonId,
        details: { before: { code: before.code, requiresApproval: before.requires_approval }, changes: dto },
      });
      const row = await ctx.query(`SELECT * FROM return_reason WHERE id = $1`, [reasonId]);
      return this.mapReason(row.rows[0]!);
    });
  }

  private mapReason(row: Record<string, unknown>): ReturnReasonDto {
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      requiresApproval: Boolean(row.requires_approval),
      refundPermitted: Boolean(row.refund_permitted),
      replacementPermitted: Boolean(row.replacement_permitted),
      storeCreditPermitted: Boolean(row.store_credit_permitted),
      restockPermitted: Boolean(row.restock_permitted),
      inspectionRequired: Boolean(row.inspection_required),
      evidenceRequired: Boolean(row.evidence_required),
      refundDeadlineDays: row.refund_deadline_days == null ? null : Number(row.refund_deadline_days),
      isActive: Boolean(row.is_active),
      sortOrder: Number(row.sort_order),
    };
  }

  /** Load a reason by code within the tenant (RLS-filtered). */
  private async loadReasonByCode(ctx: UowContext, code: string) {
    const r = await ctx.query(`SELECT * FROM return_reason WHERE code = $1`, [code]);
    if (r.rows.length === 0) {
      throw new NotFoundError('return reason', code);
    }
    return this.mapReason(r.rows[0]!);
  }

  // =========================================================================
  // Returnable invoice evidence (the returns UI entry point)
  // =========================================================================

  async getReturnableInvoice(tenantId: string, invoiceId: string): Promise<ReturnableInvoiceDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const inv = await ctx.query(
        `SELECT i.id, i.code, i.customer_id, i.business_date, i.total, i.subtotal, i.order_discount,
                i.tax_inclusive, i.status, c.name AS customer_name
           FROM invoice i LEFT JOIN customer c ON c.id = i.customer_id
          WHERE i.id = $1`,
        [invoiceId],
      );
      if (inv.rows.length === 0) throw new NotFoundError('invoice', invoiceId);
      const invoice = inv.rows[0]!;
      if (String(invoice.status) !== 'posted') {
        throw new ConflictError(`invoice is '${String(invoice.status)}' — returns are only allowed on posted invoices`);
      }
      const settled = await ctx.query(
        `SELECT (COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa WHERE pa.invoice_id = $1), 0)
                 + COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = $1), 0))::text AS paid`,
        [invoiceId],
      );
      const paid = parseMoney(String(settled.rows[0]!.paid));
      const total = parseMoney(String(invoice.total));
      const amountDue = total - paid > 0n ? total - paid : 0n;

      const lines = await ctx.query(
        `SELECT il.id, il.product_id, il.unit_id, il.quantity, il.quantity_base, il.unit_price,
                il.line_net, il.cost_at_sale, il.cogs, p.code AS product_code, p.name AS product_name,
                COALESCE((SELECT SUM(rol.quantity_base) FROM return_order_line rol
                   JOIN return_order ro ON ro.id = rol.return_order_id
                  WHERE rol.invoice_line_id = il.id
                    AND ro.status IN ('submitted','approved','received','processed','completed')), 0)::text AS returned_qty
           FROM invoice_line il LEFT JOIN product p ON p.id = il.product_id
          WHERE il.invoice_id = $1 ORDER BY il.sort_order`,
        [invoiceId],
      );

      const subtotal = parseMoney(String(invoice.subtotal));
      const discount = parseMoney(String(invoice.order_discount));

      return {
        invoiceId: String(invoice.id),
        code: String(invoice.code),
        customerId: invoice.customer_id == null ? null : String(invoice.customer_id),
        customerName: invoice.customer_name == null ? null : String(invoice.customer_name),
        businessDate: dateCol(invoice.business_date),
        total: String(invoice.total),
        paymentStatus: total <= 0n ? 'paid' : paid >= total ? 'paid' : paid > 0n ? 'part_paid' : 'unpaid',
        amountPaid: formatMoney(paid),
        amountDue: formatMoney(amountDue),
        taxInclusive: Boolean(invoice.tax_inclusive),
        orderDiscount: String(invoice.order_discount),
        subtotal: String(invoice.subtotal),
        lines: lines.rows.map((l: Record<string, unknown>) => {
          const qtyBase = parseQuantity(String(l.quantity_base));
          const returned = parseQuantity(String(l.returned_qty));
          const returnable = qtyBase - returned;
          const lineNet = parseMoney(String(l.line_net));
          const share = subtotal > 0n ? prorateMoney(discount, lineNet, subtotal) : 0n;
          return {
            invoiceLineId: String(l.id),
            productId: String(l.product_id),
            productCode: l.product_code == null ? null : String(l.product_code),
            productName: l.product_name == null ? null : String(l.product_name),
            unitId: l.unit_id == null ? null : String(l.unit_id),
            quantityBase: String(l.quantity_base),
            returnedQuantityBase: String(l.returned_qty),
            returnableQuantityBase: formatQty(returnable),
            unitPrice: String(l.unit_price),
            lineNet: String(l.line_net),
            effectiveNet: formatMoney(lineNet - share),
            costAtSale: l.cost_at_sale == null ? null : String(l.cost_at_sale),
          };
        }),
      };
    });
  }

  // =========================================================================
  // Create — draft (+ optional submit fast path), idempotent
  // =========================================================================

  async createReturn(principal: ReturnsPrincipal, dto: CreateReturn): Promise<ReturnOrderDto> {
    const fingerprint = returnRequestFingerprint(principal.tenantId, {
      invoiceId: dto.invoiceId,
      reasonCode: dto.reasonCode,
      customerNote: dto.customerNote ?? null,
      lines: dto.lines.map((l) => ({
        invoiceLineId: l.invoiceLineId,
        quantity: l.quantity,
        condition: l.condition,
        disposition: l.disposition,
        reasonCode: l.reasonCode ?? null,
      })),
      adjustmentAmount: dto.adjustmentAmount,
    });

    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // idempotency claim FIRST (fixed lock order: idem → invoice domain)
      if (dto.clientDocId) {
        await lockReturnIdemDomain(ctx, dto.clientDocId);
        const existing = await ctx.query(`SELECT id FROM return_order WHERE client_doc_id = $1`, [dto.clientDocId]);
        if (existing.rows.length > 0) {
          const row = (await ctx.query(`SELECT request_fingerprint FROM return_order WHERE id = $1`, [
            existing.rows[0]!.id,
          ])).rows[0]!;
          if (row!.request_fingerprint === fingerprint) {
            return this.getReturnWithinCtx(ctx, principal.tenantId, String(existing.rows[0]!.id));
          }
          throw new IdempotencyKeyReuseError(
            'return command idempotency key was already used with a different payload',
          );
        }
      }

      await lockReturnInvoiceDomain(ctx, dto.invoiceId);

      // validate invoice + load evidence
      const evidence = await this.loadInvoiceEvidence(ctx, dto.invoiceId);
      if (evidence.customerId == null) {
        throw new ValidationError(
          'the invoice has no customer — returns require a customer (record the walk-in as a customer before returning)',
        );
      }
      const reason = await this.loadReasonByCode(ctx, dto.reasonCode);
      if (!reason.isActive) throw new ValidationError(`return reason '${dto.reasonCode}' is inactive`);
      if (dto.lines.length > 0 && parseMoney(dto.adjustmentAmount) > 0n) {
        throw new ValidationError('a return with physical lines cannot also carry an adjustment amount');
      }
      if (dto.creditDisposition === 'refund' && !reason.refundPermitted) {
        throw new ValidationError(`reason '${dto.reasonCode}' does not permit refunds`);
      }
      if (dto.creditDisposition === 'store_credit' && !reason.storeCreditPermitted) {
        throw new ValidationError(`reason '${dto.reasonCode}' does not permit store credit`);
      }

      // per-line validation + evidence snapshot
      const lineRows = this.buildLineRows(evidence, dto, reason);
      // reserved-quantity check under the invoice-domain lock (the DB
      // deferred trigger is the second wall; this is the clean 409)
      for (const line of lineRows) {
        const cumBefore = await this.cumReturnedBase(ctx, String(line.invoiceLineId));
        const lineBase = parseQuantity(String(evidence.lineMap.get(String(line.invoiceLineId))!.quantity_base));
        if (cumBefore + parseQuantity(String(line.quantityBase)) > lineBase) {
          throw new ConflictError(
            `return quantity exceeds the remaining returnable quantity for line ${String(line.invoiceLineId)} (returnable ${formatQuantity(lineBase - cumBefore)})`,
          );
        }
      }

      // policy: refund deadline
      this.assertRefundDeadline(reason, evidence.invoiceDate, dto.businessDate ?? dateCol(new Date()));

      const code = await this.sequences.allocate(ctx, { docType: 'RETURN_ORDER' });
      const id = randomUUID();
      // resolve per-line reason overrides to reason ids
      const reasonCodes = new Set(
        lineRows.map((l) => l.reasonCode).filter((c): c is string => c != null && c !== dto.reasonCode),
      );
      const reasonIdByCode = new Map<string, string>();
      for (const rc of reasonCodes) {
        const perLine = await this.loadReasonByCode(ctx, rc);
        if (!perLine.isActive) throw new ValidationError(`return reason '${rc}' is inactive`);
        reasonIdByCode.set(rc, perLine.id);
      }
      const headerReasonRow = await ctx.query<{ id: string }>(
        `SELECT id FROM return_reason WHERE code = $1`, [dto.reasonCode],
      );
      const headerReasonId = headerReasonRow.rows[0]!.id;
      try {
        await ctx.query(
          `INSERT INTO return_order (id, tenant_id, code, invoice_id, customer_id, warehouse_id, status,
             reason_id, credit_disposition, adjustment_amount, customer_note, internal_note,
             client_doc_id, request_fingerprint, business_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            id, principal.tenantId, code, dto.invoiceId, evidence.customerId,
            dto.warehouseId ?? evidence.warehouseId, reason.id, dto.creditDisposition,
            dto.adjustmentAmount, dto.customerNote ?? null, dto.internalNote ?? null,
            dto.clientDocId ?? null, fingerprint, dto.businessDate ?? new Date().toISOString().slice(0, 10), principal.userId,
          ],
        );
        for (const line of lineRows) {
          await ctx.query(
            `INSERT INTO return_order_line (tenant_id, return_order_id, invoice_line_id, product_id, unit_id,
               quantity, quantity_base, condition, disposition, restock_warehouse_id, reason_id,
               unit_price, line_net, order_discount_share, effective_net, cost_at_sale, cogs_at_sale, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [
              principal.tenantId, id, line.invoiceLineId, line.productId, line.unitId,
              line.quantity, line.quantityBase, line.condition, line.disposition, line.restockWarehouseId,
              line.reasonCode == null || line.reasonCode === dto.reasonCode
                ? headerReasonId
                : reasonIdByCode.get(line.reasonCode) ?? headerReasonId,
              line.unitPrice, line.lineNet, line.orderDiscountShare, line.effectiveNet,
              line.costAtSale, line.cogsAtSale, line.note,
            ],
          );
        }
      } catch (err) {
        mapUniqueViolation(err, 'return document already exists (duplicate client document id)');
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'return_order.created',
        entityType: 'return_order',
        entityId: id,
        details: { code, invoiceId: dto.invoiceId, invoiceCode: evidence.invoiceCode, lines: lineRows.length },
      });
      await ctx.outbox.emit('ReturnOrderCreated', { returnOrderId: id, code, invoiceId: dto.invoiceId });

      if (dto.submit) {
        await this.submitWithinCtx(ctx, principal, id, dto.clientDocId ?? null);
      }
      return this.getReturnWithinCtx(ctx, principal.tenantId, id);
    });
  }

  // =========================================================================
  // Lifecycle transitions
  // =========================================================================

  async submitReturn(principal: ReturnsPrincipal, dto: { id: string; clientDocId?: string | null }): Promise<ReturnOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      return this.submitWithinCtx(ctx, principal, dto.id, dto.clientDocId ?? null);
    });
  }

  private async submitWithinCtx(
    ctx: UowContext,
    principal: ReturnsPrincipal,
    returnId: string,
    _clientDocId: string | null,
  ): Promise<ReturnOrderDto> {
    const row = await this.lockReturn(ctx, returnId);
    assertReturnTransition(row.status, 'submitted');
    const reason = row.reason_id ? await this.loadReasonById(ctx, row.reason_id) : null;
    const estimate = await this.estimateGrossCredit(ctx, row);

    // auto-approval policy: reason does not require approval AND the
    // estimated credit is within the tenant threshold
    const threshold = await this.loadRefundApprovalThreshold(ctx);
    const autoApprove = reason != null && !reason.requiresApproval && estimate <= threshold;

    if (autoApprove) {
      await ctx.query(
        `UPDATE return_order SET status = 'approved', approved_by = $2, approved_at = now(),
           auto_approved = true, updated_at = now() WHERE id = $1`,
        [returnId, principal.userId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'return_order.auto_approved', entityType: 'return_order', entityId: returnId,
        details: { estimate: formatMoney(estimate), threshold: formatMoney(threshold), reasonCode: reason?.code },
      });
    } else {
      await ctx.query(`UPDATE return_order SET status = 'submitted', updated_at = now() WHERE id = $1`, [returnId]);
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'return_order.submitted', entityType: 'return_order', entityId: returnId,
        details: { estimatedCredit: formatMoney(estimate) },
      });
    }
    await ctx.outbox.emit('ReturnOrderSubmitted', { returnOrderId: returnId, autoApproved: autoApprove });
    return this.getReturnWithinCtx(ctx, ctx.tenantId, returnId);
  }

  async approveReturn(principal: ReturnsPrincipal, dto: { id: string }): Promise<ReturnOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const row = await this.lockReturn(ctx, dto.id);
      assertReturnTransition(row.status, 'approved');
      await ctx.query(
        `UPDATE return_order SET status = 'approved', approved_by = $2, approved_at = now(),
           auto_approved = false, updated_at = now() WHERE id = $1`,
        [dto.id, principal.userId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'return_order.approved', entityType: 'return_order', entityId: dto.id,
        details: { code: row.code },
      });
      await ctx.outbox.emit('ReturnOrderApproved', { returnOrderId: dto.id });
      return this.getReturnWithinCtx(ctx, ctx.tenantId, dto.id);
    });
  }

  async rejectReturn(principal: ReturnsPrincipal, dto: { id: string; reason: string }): Promise<ReturnOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const row = await this.lockReturn(ctx, dto.id);
      assertReturnTransition(row.status, 'rejected');
      await ctx.query(
        `UPDATE return_order SET status = 'rejected', rejected_by = $2, rejected_at = now(),
           rejection_reason = $3, updated_at = now() WHERE id = $1`,
        [dto.id, principal.userId, dto.reason],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'return_order.rejected', entityType: 'return_order', entityId: dto.id,
        details: { code: row.code, reason: dto.reason },
      });
      await ctx.outbox.emit('ReturnOrderRejected', { returnOrderId: dto.id, reason: dto.reason });
      return this.getReturnWithinCtx(ctx, ctx.tenantId, dto.id);
    });
  }

  async receiveReturn(principal: ReturnsPrincipal, dto: { id: string; inspectionNote?: string | null }): Promise<ReturnOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      return this.receiveWithinCtx(ctx, principal, dto.id, dto.inspectionNote ?? null);
    });
  }

  private async receiveWithinCtx(
    ctx: UowContext,
    principal: ReturnsPrincipal,
    returnId: string,
    inspectionNote: string | null,
  ): Promise<ReturnOrderDto> {
    const row = await this.lockReturn(ctx, returnId);
    assertReturnTransition(row.status, 'received');
    await ctx.query(
      `UPDATE return_order SET status = 'received', received_by = $2, received_at = now(),
           inspection_note = COALESCE($3, inspection_note), updated_at = now() WHERE id = $1`,
      [returnId, principal.userId, inspectionNote],
    );
    await ctx.audit.record({
      tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
      action: 'return_order.received', entityType: 'return_order', entityId: returnId,
      details: { code: row.code, inspectionNote },
    });
    await ctx.outbox.emit('ReturnOrderReceived', { returnOrderId: returnId });
    return this.getReturnWithinCtx(ctx, ctx.tenantId, returnId);
  }

  async cancelReturn(principal: ReturnsPrincipal, dto: { id: string; reason: string }): Promise<ReturnOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const row = await this.lockReturn(ctx, dto.id);
      assertReturnTransition(row.status, 'cancelled');
      await ctx.query(
        `UPDATE return_order SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [dto.id],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'return_order.cancelled', entityType: 'return_order', entityId: dto.id,
        details: { code: row.code, reason: dto.reason },
      });
      await ctx.outbox.emit('ReturnOrderCancelled', { returnOrderId: dto.id, reason: dto.reason });
      return this.getReturnWithinCtx(ctx, ctx.tenantId, dto.id);
    });
  }

  // =========================================================================
  // PROCESS — the financial core (ONE transaction)
  // =========================================================================

  async processReturn(
    principal: ReturnsPrincipal,
    returnId: string,
    simulateFailure?: string,
  ): Promise<ReturnOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      return (await this.processWithinCtx(ctx, principal, returnId, { simulateFailure })).dto;
    });
  }

  /** Usable inside an existing transaction (exchanges compose this). */
  async processWithinCtx(
    ctx: UowContext,
    principal: ReturnsPrincipal,
    returnId: string,
    opts: { forceRefundDisposition?: boolean; simulateFailure?: string } = {},
  ): Promise<{ dto: ReturnOrderDto; creditNoteId: string; refundAmount: string }> {
    const row = await this.lockReturn(ctx, returnId);
    // pure price-adjustment returns (no lines) may go approved → processed
    // directly: there is nothing to physically receive
    if (row.status === 'approved') {
      const lineCount = await ctx.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM return_order_line WHERE return_order_id = $1`, [returnId]);
      if (Number(lineCount.rows[0]!.n) === 0) {
        await ctx.query(
          `UPDATE return_order SET status = 'received', received_by = $2, received_at = now(), updated_at = now() WHERE id = $1`,
          [returnId, principal.userId],
        );
        row.status = 'received';
      }
    }
    if (row.status !== 'received') {
      throw new ConflictError(`return order must be received before processing (current: '${row.status}')`);
    }
    assertReturnTransition('received', 'processed');

    await lockReturnInvoiceDomain(ctx, row.invoice_id);
    const evidence = await this.loadInvoiceEvidence(ctx, row.invoice_id);
    const lines = await this.loadLines(ctx, returnId);
    const reason = row.reason_id ? await this.loadReasonById(ctx, row.reason_id) : null;

    // ---- 1. credit math (exact scaled BigInt) ------------------------
    const subtotal = parseMoney(evidence.subtotal);
    const discount = parseMoney(evidence.orderDiscount);
    const axisTotal = subtotal - discount; // = Σ effective nets (see getReturnableInvoice)

    // cumulative credited-net axis BEFORE this credit note
    const prior = await ctx.query<{ credited: string | null; ar: string | null }>(
      `SELECT COALESCE(SUM(credited_net), 0)::text AS credited, COALESCE(SUM(ar_amount), 0)::text AS ar
         FROM credit_note WHERE invoice_id = $1`,
      [row.invoice_id],
    );
    const axisBefore = parseMoney(String(prior.rows[0]!.credited));
    const priorAr = parseMoney(String(prior.rows[0]!.ar));

    // per-line slices: effective-net share of the returned quantity
    let creditedNetSlice = parseMoney(row.adjustment_amount);
    let cogsReversal = 0n;
    const restockEntries: MovementEntry[] = [];
    const lineSlices: Array<{ lineId: string; creditNet: bigint; cogs: bigint }> = [];
    for (const line of lines) {
      const lineAxis = parseMoney(line.effective_net);
      const lineQty = parseQuantity(line.quantity_base);
      const cumReturnedBefore = await this.cumReturnedBase(ctx, line.invoice_line_id);
      const cumReturnedAfter = cumReturnedBefore + lineQty;
      const netSlice = prorateCumulative(lineAxis, parseQuantity(line.original_quantity_base), cumReturnedBefore, cumReturnedAfter);
      creditedNetSlice += netSlice;
      let lineCogsSlice = 0n;

      if (dispositionRestocks(line.disposition as never)) {
        if (reason != null && !reason.restockPermitted) {
          throw new ValidationError(`reason '${reason.code}' does not permit restocking`);
        }
        const cogs = line.cogs_at_sale ? parseMoney(line.cogs_at_sale) : null;
        if (cogs != null) {
          const cogsSlice = prorateCumulative(cogs, parseQuantity(line.original_quantity_base), cumReturnedBefore, cumReturnedAfter);
          cogsReversal += cogsSlice;
          lineCogsSlice = cogsSlice;
        }
        // restock at ORIGINAL cost evidence (never the day's AVCO price)
        restockEntries.push({
          warehouseId: line.restock_warehouse_id ?? row.warehouse_id,
          productId: line.product_id,
          movementType: 'receipt',
          quantityBase: line.quantity_base,
          unitId: line.unit_id ?? undefined,
          reason: 'customer_return',
          unitCost: line.cost_at_sale ?? undefined,
        });
      }
      lineSlices.push({ lineId: line.id, creditNet: netSlice, cogs: lineCogsSlice });
    }
    if (creditedNetSlice <= 0n) {
      throw new ValidationError('return has no positive credit value');
    }
    const axisAfter = axisBefore + creditedNetSlice;
    if (axisTotal > 0n && axisAfter > axisTotal) {
      throw new ConflictError('cumulative return credit exceeds the invoice net revenue');
    }

    // ---- 2. tax reversal per component (transaction-time evidence) ----
    const taxRows = await ctx.query<{ component_name: string; rate: string; inclusive: boolean; taxable_basis: string; tax_amount: string }>(
      `SELECT component_name, rate, inclusive, taxable_basis, tax_amount
         FROM invoice_tax_component WHERE invoice_id = $1 ORDER BY component_name`,
      [row.invoice_id],
    );
    const taxSlices: Array<{ name: string; rate: string; inclusive: boolean; basis: string; amount: bigint }> = [];
    for (const t of taxRows.rows) {
      const original = parseMoney(t.tax_amount);
      const slice =
        original > 0n && axisTotal > 0n
          ? prorateCumulative(original, axisTotal, axisBefore, axisAfter)
          : 0n;
      if (slice > 0n) {
        taxSlices.push({
          name: t.component_name,
          rate: t.rate,
          inclusive: t.inclusive,
          basis: formatMoney(creditedNetSlice),
          amount: slice,
        });
      }
    }
    const taxReversalTotal = taxSlices.reduce((s, t) => s + t.amount, 0n);

    // gross customer entitlement = credited net + reversible tax
    // (exclusive: net + tax; inclusive: tax lives INSIDE the net —
    //  netRevenueReversal = creditedNet − inclusiveTax keeps the
    //  identity total = net_revenue_reversal + tax_reversal_total true)
    const total = creditedNetSlice + taxReversalTotal;
    const netRevenueReversal = creditedNetSlice - taxReversalTotal;

    // ---- 3. settlement decomposition (AR first, then residual) -------
    const settlement = await loadInvoiceSettlement(ctx, row.invoice_id);
    const decomposition = decomposeCredit({
      grossCredit: formatMoney(total),
      invoice: settlement,
      disposition: opts.forceRefundDisposition ? 'refund' : row.credit_disposition,
      priorArSettled: formatMoney(priorAr),
    });

    // ---- 4. stock disposition (append-only receipt movements at
    //         original cost; the StockPoster maintains AVCO + balances) -
    const movements = await this.stockPoster.post(ctx, restockEntries, {
      sourceDocumentType: 'return_order',
      sourceDocumentId: returnId,
      createdBy: principal.userId,
    });
    void movements;

    // ---- 5. the balanced GL journal (ONE entry, the credit note) -----
    const purposes: GlPurpose[] = ['sales_revenue', 'accounts_receivable', 'refunds_payable', 'store_credit_liability'];
    if (taxSlices.length > 0) purposes.push('tax_payable');
    if (cogsReversal > 0n) purposes.push('inventory', 'cogs');
    const accounts = await this.finance.resolveGlAccounts(ctx, purposes);

    const creditNoteId = crypto.randomUUID();
    const journalLines: JournalLineSpec[] = [
      { accountId: accounts.get('sales_revenue')!, debit: formatMoney(netRevenueReversal), memo: 'return contra-revenue' },
    ];
    for (const t of taxSlices) {
      journalLines.push({
        accountId: accounts.get('tax_payable')!,
        debit: formatMoney(t.amount),
        memo: `tax reversal ${t.name}`,
      });
    }
    journalLines.push(
      { accountId: accounts.get('accounts_receivable')!, credit: decomposition.arAmount, memo: 'AR settlement (return credit)' },
      { accountId: accounts.get('refunds_payable')!, credit: decomposition.refundAmount, memo: 'refund payable' },
      { accountId: accounts.get('store_credit_liability')!, credit: decomposition.storeCreditAmount, memo: 'store credit issued' },
    );
    if (cogsReversal > 0n) {
      journalLines.push(
        { accountId: accounts.get('inventory')!, debit: formatMoney(cogsReversal), memo: 'returned stock at original cost' },
        { accountId: accounts.get('cogs')!, credit: formatMoney(cogsReversal), memo: 'COGS reversal (returned goods)' },
      );
    }
    const journal = await this.finance.postJournal(ctx, {
      sourceKind: 'credit_note',
      sourceId: creditNoteId,
      event: 'credit_note_posted',
      description: `Credit note for return ${row.code} (invoice ${evidence.invoiceCode})`,
      businessDate: dateCol(row.business_date),
      reference: row.code,
      createdBy: principal.userId,
      allowSoftClosedPeriod: true,
      lines: journalLines.filter((l) => (l.debit != null && parseMoney(l.debit) > 0n) || (l.credit != null && parseMoney(l.credit) > 0n)),
    });

    // ---- 6. the credit-note document + tax evidence ------------------
    const cnCode = await this.sequences.allocate(ctx, { docType: 'CREDIT_NOTE' });
    try {
      await ctx.query(
        `INSERT INTO credit_note (id, tenant_id, code, return_order_id, invoice_id, customer_id, business_date,
           total, credited_net, net_revenue_reversal, tax_reversal_total, ar_amount, refund_amount,
           store_credit_amount, cogs_reversal, journal_entry_id, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          creditNoteId, ctx.tenantId, cnCode, returnId, row.invoice_id, evidence.customerId,
          dateCol(row.business_date), formatMoney(total), formatMoney(creditedNetSlice),
          formatMoney(netRevenueReversal), formatMoney(taxReversalTotal),
          decomposition.arAmount, decomposition.refundAmount, decomposition.storeCreditAmount,
          formatMoney(cogsReversal), journal?.id ?? null, row.customer_note, principal.userId,
        ],
      );
      for (const t of taxSlices) {
        await ctx.query(
          `INSERT INTO credit_note_tax_component (tenant_id, credit_note_id, invoice_id, component_name,
             rate, inclusive, taxable_basis, tax_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [ctx.tenantId, creditNoteId, row.invoice_id, t.name, t.rate, t.inclusive, t.basis, formatMoney(t.amount)],
        );
      }
    } catch (err) {
      mapUniqueViolation(err, 'credit note already exists for this return order');
    }

    // ---- 7. store-credit issuance (explicit liability instrument) ----
    if (parseMoney(decomposition.storeCreditAmount) > 0n) {
      const scCode = await this.sequences.allocate(ctx, { docType: 'STORE_CREDIT' });
      const expiryDays = await this.loadStoreCreditExpiryDays(ctx);
      const expiry = expiryDays == null ? null : addDays(dateCol(row.business_date), expiryDays);
      await ctx.query(
        `INSERT INTO store_credit (id, tenant_id, code, credit_note_id, customer_id, amount, business_date,
           expiry_date, status, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10)`,
        [
          crypto.randomUUID(), ctx.tenantId, scCode, creditNoteId, evidence.customerId,
          decomposition.storeCreditAmount, dateCol(row.business_date), expiry,
          `issued by credit note ${cnCode}`, principal.userId,
        ],
      );
      await ctx.outbox.emit('StoreCreditIssued', {
        storeCreditCode: scCode, creditNoteCode: cnCode, customerId: evidence.customerId,
        amount: decomposition.storeCreditAmount,
      });
    }

    // ---- 8. return-order lifecycle update ----------------------------
    // persist the per-line credit evidence (margin reports + statements)
    for (const slice of lineSlices) {
      await ctx.query(
        `UPDATE return_order_line SET credit_net_slice = $2, cogs_reversal = $3 WHERE id = $1`,
        [slice.lineId, formatMoney(slice.creditNet), formatMoney(slice.cogs)],
      );
    }
    const refundAmountScaled = parseMoney(decomposition.refundAmount);
    const completed = refundAmountScaled === 0n;
    await ctx.query(
      `UPDATE return_order SET gross_credit = $2, ar_amount = $3,
         refund_amount = $4, store_credit_amount = $5, cogs_reversal = $6, credit_note_id = $7,
         processed_by = $8, processed_at = now(),
         completed_at = CASE WHEN $9 THEN now() ELSE NULL END,
         status = CASE WHEN $9 THEN 'completed' ELSE 'processed' END,
         updated_at = now()
       WHERE id = $1`,
      [
        returnId, formatMoney(total), decomposition.arAmount, decomposition.refundAmount,
        decomposition.storeCreditAmount, formatMoney(cogsReversal), creditNoteId,
        principal.userId, completed,
      ],
    );

    await ctx.audit.record({
      tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
      action: 'return_order.processed', entityType: 'return_order', entityId: returnId,
      details: {
        code: row.code, creditNoteCode: cnCode, grossCredit: formatMoney(total),
        arAmount: decomposition.arAmount, refundAmount: decomposition.refundAmount,
        storeCreditAmount: decomposition.storeCreditAmount, cogsReversal: formatMoney(cogsReversal),
        journalEntryId: journal?.id ?? null,
      },
    });
    await ctx.outbox.emit('CreditNotePosted', {
      creditNoteId, creditNoteCode: cnCode, returnOrderId: returnId, invoiceId: row.invoice_id,
      total: formatMoney(total), arAmount: decomposition.arAmount,
      refundAmount: decomposition.refundAmount, storeCreditAmount: decomposition.storeCreditAmount,
    });

    if (opts.simulateFailure === 'after_writes') {
      throw new ValidationError('simulated failure after return processing writes (atomicity test)');
    }

    return {
      dto: await this.getReturnWithinCtx(ctx, ctx.tenantId, returnId),
      creditNoteId,
      refundAmount: decomposition.refundAmount,
    };
  }

  // =========================================================================
  // Reads
  // =========================================================================

  async getReturn(tenantId: string, returnId: string): Promise<ReturnOrderDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.getReturnWithinCtx(ctx, tenantId, returnId));
  }

  async listReturns(
    tenantId: string,
    filter: { status?: string; invoiceId?: string; customerId?: string; limit?: number; offset?: number },
  ): Promise<ReturnOrderDto[]> {
    const limit = Math.min(filter.limit ?? 100, 500);
    return this.uow.run({ tenantId }, async (ctx) => {
      const conditions = ['ro.tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      if (filter.status) {
        params.push(filter.status);
        conditions.push(`ro.status = $${params.length}`);
      }
      if (filter.invoiceId) {
        params.push(filter.invoiceId);
        conditions.push(`ro.invoice_id = $${params.length}`);
      }
      if (filter.customerId) {
        params.push(filter.customerId);
        conditions.push(`ro.customer_id = $${params.length}`);
      }
      params.push(limit, filter.offset ?? 0);
      const rows = await ctx.query(
        `SELECT ro.* FROM return_order ro WHERE ${conditions.join(' AND ')}
         ORDER BY ro.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const result: ReturnOrderDto[] = [];
      for (const row of rows.rows) {
        result.push(await this.mapReturnDto(ctx, row as unknown as ReturnRow));
      }
      return result;
    });
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private async getReturnWithinCtx(ctx: UowContext, tenantId: string, returnId: string): Promise<ReturnOrderDto> {
    const r = await ctx.query(`SELECT * FROM return_order WHERE id = $1`, [returnId]);
    if (r.rows.length === 0) throw new NotFoundError('return order', returnId);
    return this.mapReturnDto(ctx, r.rows[0] as unknown as ReturnRow);
  }

  private async mapReturnDto(ctx: UowContext, row: ReturnRow): Promise<ReturnOrderDto> {
    const lines = await ctx.query(
      `SELECT rol.*, p.code AS product_code, p.name AS product_name, rr.code AS reason_code,
              il.quantity_base AS original_quantity_base
         FROM return_order_line rol
         LEFT JOIN product p ON p.id = rol.product_id
         LEFT JOIN return_reason rr ON rr.id = rol.reason_id
         JOIN invoice_line il ON il.id = rol.invoice_line_id
        WHERE rol.return_order_id = $1 ORDER BY rol.created_at`,
      [row.id],
    );
    const inv = await ctx.query<{ code: string }>(`SELECT code FROM invoice WHERE id = $1`, [row.invoice_id]);
    const cust = await ctx.query<{ name: string }>(`SELECT name FROM customer WHERE id = $1`, [row.customer_id]);
    const cn = row.credit_note_id
      ? await ctx.query<{ code: string }>(`SELECT code FROM credit_note WHERE id = $1`, [row.credit_note_id])
      : null;
    return {
      id: row.id,
      code: row.code,
      invoiceId: row.invoice_id,
      invoiceCode: inv.rows[0]?.code ?? null,
      customerId: row.customer_id,
      customerName: cust.rows[0]?.name ?? null,
      warehouseId: row.warehouse_id,
      status: row.status,
      reasonCode: (lines.rows[0] as { reason_code?: string } | undefined)?.reason_code ?? null,
      creditDisposition: row.credit_disposition,
      adjustmentAmount: String(row.adjustment_amount),
      grossCredit: row.gross_credit == null ? null : String(row.gross_credit),
      arAmount: row.ar_amount == null ? null : String(row.ar_amount),
      refundAmount: row.refund_amount == null ? null : String(row.refund_amount),
      storeCreditAmount: row.store_credit_amount == null ? null : String(row.store_credit_amount),
      cogsReversal: row.cogs_reversal == null ? null : String(row.cogs_reversal),
      creditNoteId: row.credit_note_id,
      creditNoteCode: cn?.rows[0]?.code ?? null,
      approvedBy: row.approved_by,
      approvedAt: tsColNull(row.approved_at),
      autoApproved: row.auto_approved,
      rejectedBy: row.rejected_by,
      rejectedAt: tsColNull(row.rejected_at),
      rejectionReason: row.rejection_reason,
      receivedBy: row.received_by,
      receivedAt: tsColNull(row.received_at),
      inspectionNote: row.inspection_note,
      processedBy: row.processed_by,
      processedAt: tsColNull(row.processed_at),
      completedAt: tsColNull(row.completed_at),
      customerNote: row.customer_note,
      internalNote: row.internal_note,
      businessDate: dateCol(row.business_date),
      createdAt: tsCol(row.created_at),
      lines: lines.rows.map((l: Record<string, unknown>) => ({
        id: String(l.id),
        invoiceLineId: String(l.invoice_line_id),
        productId: String(l.product_id),
        productCode: l.product_code == null ? null : String(l.product_code),
        productName: l.product_name == null ? null : String(l.product_name),
        unitId: l.unit_id == null ? null : String(l.unit_id),
        quantity: String(l.quantity),
        quantityBase: String(l.quantity_base),
        originalQuantityBase: String(l.original_quantity_base),
        condition: String(l.condition),
        disposition: String(l.disposition),
        restockWarehouseId: l.restock_warehouse_id == null ? null : String(l.restock_warehouse_id),
        reasonCode: l.reason_code == null ? null : String(l.reason_code),
        unitPrice: String(l.unit_price),
        lineNet: String(l.line_net),
        orderDiscountShare: String(l.order_discount_share),
        effectiveNet: String(l.effective_net),
        costAtSale: l.cost_at_sale == null ? null : String(l.cost_at_sale),
        cogsAtSale: l.cogs_at_sale == null ? null : String(l.cogs_at_sale),
        note: l.note == null ? null : String(l.note),
      })),
    };
  }

  private async lockReturn(ctx: UowContext, returnId: string): Promise<ReturnRow> {
    const r = await ctx.query<Record<string, unknown>>(
      `SELECT * FROM return_order WHERE id = $1 FOR UPDATE`,
      [returnId],
    );
    if (r.rows.length === 0) throw new NotFoundError('return order', returnId);
    return r.rows[0] as unknown as ReturnRow;
  }

  private async loadReasonById(ctx: UowContext, reasonId: string) {
    const r = await ctx.query(`SELECT * FROM return_reason WHERE id = $1`, [reasonId]);
    if (r.rows.length === 0) throw new NotFoundError('return reason', reasonId);
    return this.mapReason(r.rows[0]!);
  }

  private async loadRefundApprovalThreshold(ctx: UowContext): Promise<bigint> {
    const r = await ctx.query<{ refund_approval_threshold: string }>(
      `SELECT refund_approval_threshold::text FROM tenant_config WHERE tenant_id = $1`,
      [ctx.tenantId],
    );
    if (r.rows.length === 0) return 0n;
    return parseMoney(String(r.rows[0]!.refund_approval_threshold));
  }

  private async loadStoreCreditExpiryDays(ctx: UowContext): Promise<number | null> {
    // tenant setting (versioned): store_credit.expiry_days — NULL = no expiry
    const r = await ctx.query<{ value: unknown }>(
      `SELECT value FROM tenant_setting
        WHERE key = 'store_credit.expiry_days' AND effective_from <= CURRENT_DATE
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY effective_from DESC LIMIT 1`,
    );
    if (r.rows.length === 0) return null;
    const v = r.rows[0]!.value;
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
    return null;
  }

  private assertRefundDeadline(reason: { refundDeadlineDays: number | null }, invoiceDate: string, today: string): void {
    if (reason.refundDeadlineDays == null) return;
    const invoice = new Date(`${invoiceDate}T00:00:00Z`).getTime();
    const now = new Date(`${today}T00:00:00Z`).getTime();
    const days = Math.floor((now - invoice) / 86_400_000);
    if (days > reason.refundDeadlineDays) {
      throw new ValidationError(
        `return window expired: ${days} days since the sale, reason allows ${reason.refundDeadlineDays}`,
      );
    }
  }

  private async loadInvoiceEvidence(ctx: UowContext, invoiceId: string) {
    const r = await ctx.query(
      `SELECT i.id, i.code, i.customer_id, i.warehouse_id, i.status, i.business_date, i.subtotal,
              i.order_discount, i.total, i.tax_inclusive
         FROM invoice i WHERE i.id = $1 FOR UPDATE`,
      [invoiceId],
    );
    if (r.rows.length === 0) throw new NotFoundError('invoice', invoiceId);
    const inv = r.rows[0]!;
    if (String(inv.status) !== 'posted') {
      throw new ConflictError(`invoice is '${String(inv.status)}' — returns are only allowed on posted invoices`);
    }
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT il.id, il.product_id, il.unit_id, il.quantity, il.quantity_base, il.unit_price, il.line_net,
              il.cost_at_sale, il.cogs, p.code AS product_code, p.name AS product_name
         FROM invoice_line il LEFT JOIN product p ON p.id = il.product_id
        WHERE il.invoice_id = $1 ORDER BY il.sort_order`,
      [invoiceId],
    );
    const lineMap = new Map<string, InvoiceLineEvidence>();
    for (const l of lines.rows) {
      lineMap.set(String(l.id), {
        id: String(l.id),
        product_id: String(l.product_id),
        unit_id: l.unit_id == null ? null : String(l.unit_id),
        quantity: String(l.quantity),
        quantity_base: String(l.quantity_base),
        unit_price: String(l.unit_price),
        line_net: String(l.line_net),
        cost_at_sale: l.cost_at_sale == null ? null : String(l.cost_at_sale),
        cogs: l.cogs == null ? null : String(l.cogs),
        product_code: l.product_code == null ? null : String(l.product_code),
        product_name: l.product_name == null ? null : String(l.product_name),
      });
    }
    return {
      invoiceId: String(inv.id),
      invoiceCode: String(inv.code),
      customerId: inv.customer_id == null ? null : String(inv.customer_id),
      warehouseId: String(inv.warehouse_id),
      invoiceDate: dateCol(inv.business_date),
      subtotal: String(inv.subtotal),
      orderDiscount: String(inv.order_discount),
      total: String(inv.total),
      taxInclusive: Boolean(inv.tax_inclusive),
      lineMap,
    };
  }

  /** Validate dto lines against invoice evidence + already-reserved
   *  quantity; build the immutable snapshot rows. */
  private buildLineRows(
    evidence: Awaited<ReturnType<ReturnsService['loadInvoiceEvidence']>>,
    dto: CreateReturn,
    headerReason: { code: string },
  ): Array<Record<string, string | null>> {
    const seen = new Set<string>();
    const rows: Array<Record<string, string | null>> = [];
    for (const line of dto.lines) {
      if (seen.has(line.invoiceLineId)) {
        throw new ValidationError('duplicate invoice line in return');
      }
      seen.add(line.invoiceLineId);
      const il = evidence.lineMap.get(line.invoiceLineId);
      if (!il) {
        throw new ValidationError(`invoice line ${line.invoiceLineId} does not belong to the invoice`);
      }
      const qty = parseQuantity(line.quantity);
      if (qty <= 0n) throw new ValidationError('return quantity must be positive');
      // base quantity via the ORIGINAL line's own transacted→base ratio
      // (half-even to 6dp — the line's own conversion evidence)
      const lineQty = parseQuantity(il.quantity);
      const lineBase = parseQuantity(il.quantity_base);
      const qtyBase = halfEvenDiv(qty * lineBase, lineQty);
      if (qtyBase <= 0n) throw new ValidationError('return quantity rounds to zero base units');
      if (qtyBase > lineBase) {
        throw new ValidationError(`return quantity exceeds the line quantity for product ${il.product_code ?? il.product_id}`);
      }
      // order-discount share (proportional, exact)
      const subtotal = parseMoney(evidence.subtotal);
      const discount = parseMoney(evidence.orderDiscount);
      const share = subtotal > 0n ? prorateMoney(discount, parseMoney(il.line_net), subtotal) : 0n;
      rows.push({
        invoiceLineId: line.invoiceLineId,
        productId: il.product_id,
        unitId: il.unit_id,
        quantity: line.quantity,
        quantityBase: formatQty(qtyBase),
        condition: line.condition,
        disposition: line.disposition,
        restockWarehouseId: line.restockWarehouseId ?? null,
        reasonId: null, // resolved per-line below via reasonCode
        unitPrice: il.unit_price,
        lineNet: il.line_net,
        orderDiscountShare: formatMoney(share),
        effectiveNet: formatMoney(parseMoney(il.line_net) - share),
        costAtSale: il.cost_at_sale,
        cogsAtSale: il.cogs,
        note: line.note ?? null,
        reasonCode: line.reasonCode ?? headerReason.code,
      });
    }
    return rows;
  }

  private async loadLines(ctx: UowContext, returnId: string): Promise<Array<ReturnLineRow & { original_quantity_base: string }>> {
    const r = await ctx.query(
      `SELECT rol.*, il.quantity_base AS original_quantity_base
         FROM return_order_line rol
         JOIN invoice_line il ON il.id = rol.invoice_line_id
        WHERE rol.return_order_id = $1 ORDER BY rol.created_at`,
      [returnId],
    );
    return r.rows as unknown as Array<ReturnLineRow & { original_quantity_base: string }>;
  }

  /** Cumulative returned base quantity for an invoice line across ALL
   *  reserving return orders (including this return's own lines). */
  private async cumReturnedBase(ctx: UowContext, invoiceLineId: string): Promise<bigint> {
    const r = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(rol.quantity_base), 0)::text AS total
         FROM return_order_line rol
         JOIN return_order ro ON ro.id = rol.return_order_id
        WHERE rol.invoice_line_id = $1
          AND ro.status IN ('submitted','approved','received','processed','completed')`,
      [invoiceLineId],
    );
    return parseQuantity(String(r.rows[0]!.total));
  }

  /** Estimated gross credit for auto-approval decisions (upper bound:
   *  Σ effective nets + adjustment, no tax netting). */
  private async estimateGrossCredit(ctx: UowContext, row: ReturnRow): Promise<bigint> {
    const r = await ctx.query<{ total: string | null }>(
      `SELECT COALESCE(ROUND(SUM(rol.effective_net * rol.quantity_base / il.quantity_base), 4), 0)::text AS total FROM return_order_line rol JOIN invoice_line il ON il.id = rol.invoice_line_id WHERE rol.return_order_id = $1`,
      [row.id],
    );
    return parseMoney(String(r.rows[0]!.total ?? '0')) + parseMoney(String(row.adjustment_amount));
  }
}

function formatQty(q: bigint): string {
  return formatQuantity(q);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
