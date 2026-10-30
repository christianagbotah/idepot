import { Injectable } from '@nestjs/common';
import type {
  CommitSale,
  ListDto,
  ConfirmSalesOrder,
  CreateFulfillment,
  CreateQuotation,
  CreateSalesOrder,
  FulfillmentDto,
  InvoiceDto,
  QuotationDto,
  SalesOrderDto,
} from '@idepot/contracts';
import {
  ConflictError,
  MONEY_SCALE,
  NotFoundError,
  ValidationError,
  addScaled,
  assertFulfillmentTransition,
  assertQuotationTransition,
  assertSalesOrderTransition,
  convertToBaseExact,
  formatMoney,
  lineNet,
  parseMoney,
  parseQuantity,
  subScaled,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';

import type { SalePrincipal } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SalePoster } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from './document-sequence.service.js';

interface LineInput {
  productId: string;
  unitId?: string | null;
  quantityTransacted?: string | null;
  quantityBase?: string | null;
  unitPrice: string;
}

interface ResolvedOrderLine {
  productId: string;
  unitId: string | null;
  quantity: string;
  quantityBase: string;
  unitPrice: string;
  lineNet: bigint;
}

/**
 * Quotations (legacy proforma), sales orders (state machine) and
 * fulfillments/waybills (sales-pos-lifecycle §5 target model).
 *
 * - A quotation is a non-binding document: draft → converted | cancelled.
 * - An order is a promise: draft (no stock, no money) → CONFIRMED. The
 *   confirmation is the financial step: it posts the invoice for the FULL
 *   order (legacy semantics — full amount invoiced at sale creation), moves
 *   stock through the SalePoster's atomic set, and takes optional tenders
 *   (a credit sale simply has none: amount_due carries the receivable).
 * - Fulfillments/waybills then track the physical handover of already-sold
 *   goods: in-flight (draft + dispatched) + delivered can never exceed the
 *   ordered quantity (legacy quantity_due = quantity − picked preserved,
 *   without the destructive edit engine).
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly salePoster: SalePoster,
    private readonly sequences: DocumentSequenceService,
  ) {}

  /* ------------------------------ quotations ------------------------------ */

  createQuotation(principal: SalePrincipal, dto: CreateQuotation): Promise<QuotationDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'warehouse', 'warehouse', [dto.warehouseId]);
      await assertTenantRefs(ctx, 'customer', 'customer', [dto.customerId]);
      await assertTenantRefs(ctx, 'product', 'product', dto.lines.map((l) => l.productId));
      const lines = await this.resolveOrderLines(ctx, dto.lines);
      const subtotal = lines.reduce((acc, l) => addScaled(acc, MONEY_SCALE, l.lineNet, MONEY_SCALE).value, 0n);
      const code = await this.sequences.allocate(ctx, { docType: 'QUOTATION' });
      const res = await ctx.query<Record<string, unknown>>(
        `INSERT INTO quotation (tenant_id, code, warehouse_id, customer_id, valid_until, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ctx.tenantId, code, dto.warehouseId, dto.customerId ?? null, dto.validUntil ?? null, dto.note ?? null, principal.userId],
      );
      const id = String(res.rows[0]!.id);
      await this.insertOrderLines(ctx, 'quotation_line', 'quotation_id', id, lines);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'quotation.created',
        entityType: 'quotation',
        entityId: id,
        details: { code, total: formatMoney(subtotal), lines: lines.length },
      });
      await ctx.outbox.emit('QuotationCreated', { quotationId: id, code });
      return this.loadQuotation(ctx, id);
    });
  }

  cancelQuotation(principal: SalePrincipal, quotationId: string): Promise<QuotationDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const q = await this.lockHeader(ctx, 'quotation', quotationId);
      assertQuotationTransition(q.status as QuotationDto['status'], 'cancelled');
      await ctx.query(`UPDATE quotation SET status = 'cancelled' WHERE id = $1`, [quotationId]);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'quotation.cancelled',
        entityType: 'quotation',
        entityId: quotationId,
        details: { code: q.code },
      });
      return this.loadQuotation(ctx, quotationId);
    });
  }

  /** Convert a draft quotation into a DRAFT sales order (no money moves). */
  convertQuotation(principal: SalePrincipal, quotationId: string): Promise<SalesOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const q = await this.lockHeader(ctx, 'quotation', quotationId);
      assertQuotationTransition(q.status as QuotationDto['status'], 'converted');
      const lines = await ctx.query<Record<string, unknown>>(
        `SELECT product_id, unit_id, quantity::text AS quantity, quantity_base::text AS quantity_base, unit_price::text AS unit_price
         FROM quotation_line WHERE quotation_id = $1 ORDER BY sort_order, id`,
        [quotationId],
      );
      const code = await this.sequences.allocate(ctx, { docType: 'SALE_ORDER' });
      const subtotal = await this.headerSubtotal(ctx, 'quotation_line', 'quotation_id', quotationId);
      const res = await ctx.query<Record<string, unknown>>(
        `INSERT INTO sales_order (tenant_id, code, warehouse_id, customer_id, quotation_id, subtotal, total, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8) RETURNING id`,
        [
          ctx.tenantId, code, String(q.warehouse_id), q.customer_id ? String(q.customer_id) : null,
          quotationId, formatMoney(subtotal), q.note ? String(q.note) : null, principal.userId,
        ],
      );
      const orderId = String(res.rows[0]!.id);
      for (let i = 0; i < lines.rows.length; i++) {
        const l = lines.rows[i]!;
        await ctx.query(
          `INSERT INTO sales_order_line
             (tenant_id, order_id, product_id, unit_id, quantity, quantity_base, unit_price, line_net, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            ctx.tenantId, orderId, String(l.product_id), l.unit_id ? String(l.unit_id) : null,
            String(l.quantity), String(l.quantity_base), String(l.unit_price),
            formatMoney(lineNet(String(l.quantity), String(l.unit_price))), i,
          ],
        );
      }
      await ctx.query(`UPDATE quotation SET status = 'converted', converted_order_id = $2 WHERE id = $1`, [quotationId, orderId]);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'quotation.converted',
        entityType: 'quotation',
        entityId: quotationId,
        details: { code: String(q.code), orderId },
      });
      await ctx.outbox.emit('QuotationConverted', { quotationId, orderId, code: String(q.code) });
      return this.loadOrder(ctx, orderId);
    });
  }

  /* ----------------------------- sales orders ----------------------------- */

  createSalesOrder(principal: SalePrincipal, dto: CreateSalesOrder): Promise<SalesOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'warehouse', 'warehouse', [dto.warehouseId]);
      await assertTenantRefs(ctx, 'customer', 'customer', [dto.customerId]);
      await assertTenantRefs(ctx, 'product', 'product', dto.lines.map((l) => l.productId));
      const lines = await this.resolveOrderLines(ctx, dto.lines);
      const subtotal = lines.reduce((acc, l) => addScaled(acc, MONEY_SCALE, l.lineNet, MONEY_SCALE).value, 0n);
      const discount = parseMoney(dto.orderDiscount ?? '0');
      if (discount < 0n || discount > subtotal) throw new ConflictError('order discount must be between 0 and the subtotal');
      const code = await this.sequences.allocate(ctx, { docType: 'SALE_ORDER' });
      const res = await ctx.query<Record<string, unknown>>(
        `INSERT INTO sales_order (tenant_id, code, warehouse_id, customer_id, order_discount, subtotal, total, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          ctx.tenantId, code, dto.warehouseId, dto.customerId ?? null,
          formatMoney(discount), formatMoney(subtotal), formatMoney(subScaled(subtotal, MONEY_SCALE, discount, MONEY_SCALE).value),
          dto.note ?? null, principal.userId,
        ],
      );
      const id = String(res.rows[0]!.id);
      await this.insertOrderLines(ctx, 'sales_order_line', 'order_id', id, lines);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'sales_order.created',
        entityType: 'sales_order',
        entityId: id,
        details: { code, total: formatMoney(subtotal), lines: lines.length },
      });
      await ctx.outbox.emit('SalesOrderCreated', { orderId: id, code });
      return this.loadOrder(ctx, id);
    });
  }

  /**
   * CONFIRM = the financial step. Posts the invoice for the full order via
   * the SalePoster atomic set (invoice + stock + COGS + tenders + audit +
   * outbox in ONE transaction) and flips the order to confirmed. Optional
   * tenders pay part/all of it now — a credit sale simply has none.
   */
  confirmSalesOrder(principal: SalePrincipal, orderId: string, dto: ConfirmSalesOrder): Promise<{ order: SalesOrderDto; invoice: InvoiceDto }> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const order = await this.lockHeader(ctx, 'sales_order', orderId);
      assertSalesOrderTransition(order.status as SalesOrderDto['status'], 'confirmed');
      const lines = await ctx.query<Record<string, unknown>>(
        `SELECT product_id, unit_id, quantity::text AS quantity, quantity_base::text AS quantity_base, unit_price::text AS unit_price
         FROM sales_order_line WHERE order_id = $1 ORDER BY sort_order, id`,
        [orderId],
      );
      if (lines.rows.length === 0) throw new ConflictError('order has no lines');
      const saleInput: CommitSale = {
        warehouseId: String(order.warehouse_id),
        customerId: order.customer_id ? String(order.customer_id) : null,
        shiftId: dto.shiftId ?? null,
        orderDiscount: String(order.order_discount),
        note: `order ${String(order.code)}`,
        lines: lines.rows.map((l) => ({
          productId: String(l.product_id),
          unitId: l.unit_id ? String(l.unit_id) : null,
          quantityTransacted: l.unit_id ? String(l.quantity) : null,
          quantityBase: l.unit_id ? null : String(l.quantity_base),
          unitPrice: String(l.unit_price),
        })),
        tenders: dto.tenders,
      };
      const posted = await this.salePoster.postSale(ctx, principal, { ...saleInput, source: 'order' });
      await ctx.query(
        `UPDATE sales_order SET status = 'confirmed', confirmed_by = $2, confirmed_at = now(), invoice_id = $3
         WHERE id = $1`,
        [orderId, principal.userId, posted.invoice.id],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'sales_order.confirmed',
        entityType: 'sales_order',
        entityId: orderId,
        details: { code: String(order.code), invoiceId: posted.invoice.id, invoiceCode: posted.invoice.code },
      });
      await ctx.outbox.emit('SalesOrderConfirmed', {
        orderId,
        code: String(order.code),
        invoiceId: posted.invoice.id,
      });
      return { order: await this.loadOrder(ctx, orderId), invoice: posted.invoice };
    });
  }

  /** Manager closes a fulfilled (and, by policy, fully delivered) order. */
  closeSalesOrder(principal: SalePrincipal, orderId: string): Promise<SalesOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const order = await this.lockHeader(ctx, 'sales_order', orderId);
      assertSalesOrderTransition(order.status as SalesOrderDto['status'], 'closed');
      await ctx.query(`UPDATE sales_order SET status = 'closed' WHERE id = $1`, [orderId]);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'sales_order.closed',
        entityType: 'sales_order',
        entityId: orderId,
        details: { code: String(order.code) },
      });
      return this.loadOrder(ctx, orderId);
    });
  }

  /* ------------------------------ fulfillments ---------------------------- */

  createFulfillment(principal: SalePrincipal, dto: CreateFulfillment): Promise<FulfillmentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const order = await this.lockHeader(ctx, 'sales_order', dto.salesOrderId);
      if (!['confirmed', 'partially_fulfilled', 'fulfilled'].includes(String(order.status))) {
        throw new ConflictError(`cannot fulfill an order in status ${String(order.status)}`);
      }
      const orderLines = await ctx.query<Record<string, unknown>>(
        `SELECT id, product_id, quantity_base::text AS quantity_base, fulfilled_quantity_base::text AS fulfilled_quantity_base
         FROM sales_order_line WHERE order_id = $1`,
        [dto.salesOrderId],
      );
      const lineById = new Map(orderLines.rows.map((l) => [String(l.id), l]));
      await assertTenantRefs(ctx, 'product', 'product', dto.lines.map((l) => lineById.get(l.orderLineId) ? String(lineById.get(l.orderLineId)!.product_id) : l.orderLineId));

      // in-flight (draft + dispatched) + delivered can never over-promise
      for (const line of dto.lines) {
        const ol = lineById.get(line.orderLineId);
        if (!ol) throw new NotFoundError('sales_order_line', line.orderLineId);
        parseQuantity(line.quantityBase);
        if (parseQuantity(line.quantityBase) <= 0n) throw new ValidationError('fulfillment quantity must be > 0');
        const committed = await ctx.query<{ committed: string }>(
          `SELECT COALESCE(SUM(fl.quantity_base), 0)::text AS committed
           FROM fulfillment_line fl
           JOIN fulfillment f ON f.id = fl.fulfillment_id
           WHERE fl.order_line_id = $1 AND f.status IN ('draft','dispatched','delivered')`,
          [line.orderLineId],
        );
        const available = parseQuantity(String(ol.quantity_base)) - parseQuantity(String(ol.fulfilled_quantity_base));
        const inFlight = parseQuantity(String(committed.rows[0]!.committed)) - parseQuantity(String(ol.fulfilled_quantity_base));
        if (inFlight + parseQuantity(line.quantityBase) > available) {
          throw new ConflictError(
            `fulfillment exceeds the outstanding ordered quantity for line ${line.orderLineId} (ordered ${String(ol.quantity_base)}, delivered ${String(ol.fulfilled_quantity_base)}, in flight ${formatQuantity6(inFlight)})`,
          );
        }
      }

      // the waybill number is allocated at creation (driver takes the print)
      const code = dto.code ?? await this.sequences.allocate(ctx, { docType: 'WAYBILL' });
      const res = await ctx.query<Record<string, unknown>>(
        `INSERT INTO fulfillment (tenant_id, code, sales_order_id, warehouse_id, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ctx.tenantId, code, dto.salesOrderId, String(order.warehouse_id), dto.note ?? null, principal.userId],
      );
      const id = String(res.rows[0]!.id);
      for (const line of dto.lines) {
        const ol = lineById.get(line.orderLineId)!;
        await ctx.query(
          `INSERT INTO fulfillment_line (tenant_id, fulfillment_id, order_line_id, product_id, quantity_base)
           VALUES ($1,$2,$3,$4,$5)`,
          [ctx.tenantId, id, line.orderLineId, String(ol.product_id), line.quantityBase],
        );
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'fulfillment.created',
        entityType: 'fulfillment',
        entityId: id,
        details: { code, salesOrderId: dto.salesOrderId, lines: dto.lines.length },
      });
      await ctx.outbox.emit('FulfillmentCreated', { fulfillmentId: id, code, salesOrderId: dto.salesOrderId });
      return this.loadFulfillment(ctx, id);
    });
  }

  dispatchFulfillment(principal: SalePrincipal, fulfillmentId: string): Promise<FulfillmentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const f = await this.lockFulfillment(ctx, fulfillmentId);
      assertFulfillmentTransition(f.status as FulfillmentDto['status'], 'dispatched');
      await ctx.query(
        `UPDATE fulfillment SET status = 'dispatched', dispatched_by = $2, dispatched_at = now() WHERE id = $1`,
        [fulfillmentId, principal.userId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'fulfillment.dispatched',
        entityType: 'fulfillment',
        entityId: fulfillmentId,
        details: { code: String(f.code) },
      });
      await ctx.outbox.emit('FulfillmentDispatched', { fulfillmentId, code: String(f.code) });
      return this.loadFulfillment(ctx, fulfillmentId);
    });
  }

  /** Delivery: the physical handover. Advances the order-line fulfilled
   *  counters and derives the order status (partially_fulfilled/fulfilled). */
  deliverFulfillment(principal: SalePrincipal, fulfillmentId: string): Promise<FulfillmentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const f = await this.lockFulfillment(ctx, fulfillmentId);
      assertFulfillmentTransition(f.status as FulfillmentDto['status'], 'delivered');
      const lines = await ctx.query<Record<string, unknown>>(
        `SELECT order_line_id, quantity_base::text AS quantity_base
         FROM fulfillment_line WHERE fulfillment_id = $1 ORDER BY order_line_id`,
        [fulfillmentId],
      );
      for (const l of lines.rows) {
        await ctx.query(
          `UPDATE sales_order_line
           SET fulfilled_quantity_base = fulfilled_quantity_base + $2
           WHERE id = $1 AND tenant_id = $3`,
          [String(l.order_line_id), String(l.quantity_base), ctx.tenantId],
        );
      }
      await ctx.query(
        `UPDATE fulfillment SET status = 'delivered', delivered_by = $2, delivered_at = now() WHERE id = $1`,
        [fulfillmentId, principal.userId],
      );
      await this.deriveOrderStatus(ctx, String(f.sales_order_id), principal);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'fulfillment.delivered',
        entityType: 'fulfillment',
        entityId: fulfillmentId,
        details: { code: String(f.code), lines: lines.rows.length },
      });
      await ctx.outbox.emit('FulfillmentDelivered', { fulfillmentId, code: String(f.code) });
      return this.loadFulfillment(ctx, fulfillmentId);
    });
  }

  cancelFulfillment(principal: SalePrincipal, fulfillmentId: string): Promise<FulfillmentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const f = await this.lockFulfillment(ctx, fulfillmentId);
      assertFulfillmentTransition(f.status as FulfillmentDto['status'], 'cancelled');
      await ctx.query(`UPDATE fulfillment SET status = 'cancelled' WHERE id = $1`, [fulfillmentId]);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'fulfillment.cancelled',
        entityType: 'fulfillment',
        entityId: fulfillmentId,
        details: { code: String(f.code) },
      });
      return this.loadFulfillment(ctx, fulfillmentId);
    });
  }

  /* --------------------------------- reads -------------------------------- */

  async getQuotation(tenantId: string, id: string): Promise<QuotationDto> {
    return this.uow.run({ tenantId }, (ctx) => this.loadQuotation(ctx, id));
  }

  async listQuotations(tenantId: string): Promise<ListDto<QuotationDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM quotation WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [ctx.tenantId],
      );
      const items: QuotationDto[] = [];
      for (const r of res.rows) items.push(await this.loadQuotation(ctx, r.id));
      return { items, total: items.length };
    });
  }

  async getOrder(tenantId: string, id: string): Promise<SalesOrderDto> {
    return this.uow.run({ tenantId }, (ctx) => this.loadOrder(ctx, id));
  }

  async listOrders(tenantId: string, opts: { status?: string } = {}): Promise<ListDto<SalesOrderDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'tenant_id = $1';
      if (opts.status) {
        params.push(opts.status);
        where += ` AND status = $${params.length}`;
      }
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM sales_order WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
        params,
      );
      const items: SalesOrderDto[] = [];
      for (const r of res.rows) items.push(await this.loadOrder(ctx, r.id));
      return { items, total: items.length };
    });
  }

  async getFulfillment(tenantId: string, id: string): Promise<FulfillmentDto> {
    return this.uow.run({ tenantId }, (ctx) => this.loadFulfillment(ctx, id));
  }

  async listFulfillments(tenantId: string, opts: { salesOrderId?: string } = {}): Promise<ListDto<FulfillmentDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'f.tenant_id = $1';
      if (opts.salesOrderId) {
        params.push(opts.salesOrderId);
        where += ` AND f.sales_order_id = $${params.length}`;
      }
      const res = await ctx.query<{ id: string }>(
        `SELECT f.id FROM fulfillment f WHERE ${where} ORDER BY f.created_at DESC LIMIT 100`,
        params,
      );
      const items: FulfillmentDto[] = [];
      for (const r of res.rows) items.push(await this.loadFulfillment(ctx, r.id));
      return { items, total: items.length };
    });
  }

  /* ------------------------------- internals ------------------------------ */

  private async resolveOrderLines(ctx: UowContext, lines: LineInput[]): Promise<ResolvedOrderLine[]> {
    const out: ResolvedOrderLine[] = [];
    for (const line of lines) {
      const hasUnit = line.unitId != null && line.unitId !== '';
      const hasTransacted = line.quantityTransacted != null && line.quantityTransacted !== '';
      if (hasUnit !== hasTransacted) {
        throw new ValidationError('cross-unit lines require unitId and quantityTransacted together (base-unit lines take quantityBase only)');
      }
      const prodRes = await ctx.query<{ base_unit_id: string }>(
        `SELECT base_unit_id FROM product WHERE id = $1`,
        [line.productId],
      );
      if (prodRes.rows.length === 0) throw new NotFoundError('product', line.productId);
      const baseUnitId = String(prodRes.rows[0]!.base_unit_id);
      let unitId: string | null = null;
      let quantity: string;
      let factor = '1';
      if (hasUnit) {
        unitId = line.unitId!;
        quantity = line.quantityTransacted!;
        if (unitId !== baseUnitId) {
          const cfg = await ctx.query<{ conversion_factor: string }>(
            `SELECT conversion_factor::text AS conversion_factor FROM product_unit WHERE product_id = $1 AND unit_id = $2`,
            [line.productId, unitId],
          );
          if (cfg.rows.length === 0) throw new NotFoundError('product_unit configuration', `${line.productId}/${unitId}`);
          factor = cfg.rows[0]!.conversion_factor;
        }
      } else {
        quantity = line.quantityBase!;
      }
      if (parseQuantity(quantity) <= 0n) throw new ValidationError('order quantity must be > 0');
      const quantityBase = hasUnit ? convertToBaseExact(quantity, factor) : quantity;
      out.push({
        productId: line.productId,
        unitId,
        quantity,
        quantityBase,
        unitPrice: line.unitPrice,
        lineNet: lineNet(quantity, line.unitPrice),
      });
    }
    return out;
  }

  private async insertOrderLines(ctx: UowContext, table: 'quotation_line' | 'sales_order_line', fk: 'quotation_id' | 'order_id', id: string, lines: ResolvedOrderLine[]): Promise<void> {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      await ctx.query(
        `INSERT INTO ${table} (tenant_id, ${fk}, product_id, unit_id, quantity, quantity_base, unit_price, line_net, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ctx.tenantId, id, l.productId, l.unitId, l.quantity, l.quantityBase, l.unitPrice, formatMoney(l.lineNet), i],
      );
    }
  }

  private async headerSubtotal(ctx: UowContext, table: 'quotation_line' | 'sales_order_line', fk: string, id: string): Promise<bigint> {
    const res = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(line_net), 0)::text AS total FROM ${table} WHERE ${fk} = $1`,
      [id],
    );
    return parseMoney(res.rows[0]!.total);
  }

  /** Derive order status from delivery progress (partially_fulfilled/fulfilled). */
  private async deriveOrderStatus(ctx: UowContext, orderId: string, principal: SalePrincipal): Promise<void> {
    const res = await ctx.query<{ status: string; total: number; done: number }>(
      `SELECT o.status,
              count(*)::int AS total,
              count(*) FILTER (WHERE l.fulfilled_quantity_base >= l.quantity_base)::int AS done
       FROM sales_order o JOIN sales_order_line l ON l.order_id = o.id
       WHERE o.id = $1 AND o.tenant_id = $2
       GROUP BY o.status`,
      [orderId, ctx.tenantId],
    );
    const row = res.rows[0];
    if (!row) return;
    const from = String(row.status) as SalesOrderDto['status'];
    let to: SalesOrderDto['status'] | null = null;
    if (row.done >= row.total && row.total > 0 && (from === 'confirmed' || from === 'partially_fulfilled')) {
      to = 'fulfilled';
    } else if (row.done > 0 && (from === 'confirmed')) {
      to = 'partially_fulfilled';
    } else if (row.done < row.total && from === 'fulfilled') {
      to = 'partially_fulfilled';
    }
    if (to && to !== from) {
      assertSalesOrderTransition(from, to);
      await ctx.query(`UPDATE sales_order SET status = $2 WHERE id = $1`, [orderId, to]);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'sales_order.status_derived',
        entityType: 'sales_order',
        entityId: orderId,
        details: { from, to },
      });
    }
  }

  private async lockHeader(ctx: UowContext, table: 'quotation' | 'sales_order', id: string): Promise<Record<string, unknown>> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError(table, id);
    return res.rows[0]!;
  }

  private async lockFulfillment(ctx: UowContext, id: string): Promise<Record<string, unknown>> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT * FROM fulfillment WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('fulfillment', id);
    return res.rows[0]!;
  }

  private async loadQuotation(ctx: UowContext, id: string): Promise<QuotationDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT q.id, q.code, q.warehouse_id, q.customer_id, c.name AS customer_name, q.status,
              q.valid_until::text AS valid_until, q.converted_order_id, q.note, q.created_by, q.created_at
       FROM quotation q LEFT JOIN customer c ON c.id = q.customer_id
       WHERE q.id = $1 AND q.tenant_id = $2`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('quotation', id);
    const h = res.rows[0]!;
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT id, product_id, unit_id, quantity::text AS quantity, quantity_base::text AS quantity_base,
              unit_price::text AS unit_price, line_net::text AS line_net
       FROM quotation_line WHERE quotation_id = $1 ORDER BY sort_order, id`,
      [id],
    );
    const subtotal = lines.rows.reduce(
      (acc, r) => addScaled(acc, MONEY_SCALE, parseMoney(String(r.line_net)), MONEY_SCALE).value,
      0n,
    );
    return {
      id: String(h.id),
      code: String(h.code),
      warehouseId: String(h.warehouse_id),
      customerId: h.customer_id ? String(h.customer_id) : null,
      customerName: h.customer_name ? String(h.customer_name) : null,
      status: String(h.status) as QuotationDto['status'],
      subtotal: formatMoney(subtotal),
      total: formatMoney(subtotal),
      validUntil: h.valid_until ? String(h.valid_until) : null,
      convertedOrderId: h.converted_order_id ? String(h.converted_order_id) : null,
      note: h.note ? String(h.note) : null,
      lines: lines.rows.map((r) => ({
        id: String(r.id),
        productId: String(r.product_id),
        unitId: r.unit_id ? String(r.unit_id) : null,
        quantity: String(r.quantity),
        quantityBase: String(r.quantity_base),
        unitPrice: String(r.unit_price),
        lineNet: String(r.line_net),
      })),
      createdBy: h.created_by ? String(h.created_by) : null,
      createdAt: new Date(h.created_at as string).toISOString(),
    };
  }

  private async loadOrder(ctx: UowContext, id: string): Promise<SalesOrderDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT o.id, o.code, o.warehouse_id, o.customer_id, c.name AS customer_name, o.status,
              o.subtotal::text AS subtotal, o.order_discount::text AS order_discount, o.total::text AS total,
              o.invoice_id, i.code AS invoice_code, o.quotation_id, o.note, o.created_by, o.created_at,
              o.confirmed_at
       FROM sales_order o
       LEFT JOIN customer c ON c.id = o.customer_id
       LEFT JOIN invoice i ON i.id = o.invoice_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('sales_order', id);
    const h = res.rows[0]!;
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT id, product_id, unit_id, quantity::text AS quantity, quantity_base::text AS quantity_base,
              unit_price::text AS unit_price, line_net::text AS line_net,
              fulfilled_quantity_base::text AS fulfilled_quantity_base
       FROM sales_order_line WHERE order_id = $1 ORDER BY sort_order, id`,
      [id],
    );
    return {
      id: String(h.id),
      code: String(h.code),
      warehouseId: String(h.warehouse_id),
      customerId: h.customer_id ? String(h.customer_id) : null,
      customerName: h.customer_name ? String(h.customer_name) : null,
      status: String(h.status) as SalesOrderDto['status'],
      subtotal: String(h.subtotal),
      orderDiscount: String(h.order_discount),
      total: String(h.total),
      invoiceId: h.invoice_id ? String(h.invoice_id) : null,
      invoiceCode: h.invoice_code ? String(h.invoice_code) : null,
      quotationId: h.quotation_id ? String(h.quotation_id) : null,
      note: h.note ? String(h.note) : null,
      lines: lines.rows.map((r) => ({
        id: String(r.id),
        productId: String(r.product_id),
        unitId: r.unit_id ? String(r.unit_id) : null,
        quantity: String(r.quantity),
        quantityBase: String(r.quantity_base),
        unitPrice: String(r.unit_price),
        lineNet: String(r.line_net),
        fulfilledQuantityBase: String(r.fulfilled_quantity_base),
      })),
      createdBy: h.created_by ? String(h.created_by) : null,
      createdAt: new Date(h.created_at as string).toISOString(),
      confirmedAt: h.confirmed_at ? new Date(h.confirmed_at as string).toISOString() : null,
    };
  }

  private async loadFulfillment(ctx: UowContext, id: string): Promise<FulfillmentDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT f.id, f.code, f.sales_order_id, o.code AS sales_order_code, f.warehouse_id, f.status,
              f.dispatched_by, f.dispatched_at, f.delivered_by, f.delivered_at, f.note, f.created_by, f.created_at
       FROM fulfillment f
       LEFT JOIN sales_order o ON o.id = f.sales_order_id
       WHERE f.id = $1 AND f.tenant_id = $2`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('fulfillment', id);
    const h = res.rows[0]!;
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT id, order_line_id, product_id, quantity_base::text AS quantity_base
       FROM fulfillment_line WHERE fulfillment_id = $1 ORDER BY order_line_id`,
      [id],
    );
    return {
      id: String(h.id),
      code: String(h.code),
      salesOrderId: String(h.sales_order_id),
      salesOrderCode: h.sales_order_code ? String(h.sales_order_code) : null,
      warehouseId: String(h.warehouse_id),
      status: String(h.status) as FulfillmentDto['status'],
      dispatchedBy: h.dispatched_by ? String(h.dispatched_by) : null,
      dispatchedAt: h.dispatched_at ? new Date(h.dispatched_at as string).toISOString() : null,
      deliveredBy: h.delivered_by ? String(h.delivered_by) : null,
      deliveredAt: h.delivered_at ? new Date(h.delivered_at as string).toISOString() : null,
      note: h.note ? String(h.note) : null,
      lines: lines.rows.map((r) => ({
        id: String(r.id),
        orderLineId: String(r.order_line_id),
        productId: String(r.product_id),
        quantityBase: String(r.quantity_base),
      })),
      createdBy: h.created_by ? String(h.created_by) : null,
      createdAt: new Date(h.created_at as string).toISOString(),
    };
  }
}

function formatQuantity6(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const digits = abs.toString().padStart(7, '0');
  return `${neg ? '-' : ''}${digits.slice(0, digits.length - 6)}.${digits.slice(digits.length - 6)}`;
}
