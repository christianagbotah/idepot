import { Injectable } from '@nestjs/common';
import type { ReceiptPayloadDto } from '@idepot/contracts';
import { NotFoundError } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';

/**
 * Receipt & print payloads (pos-hardware §4/§5 corrected behaviours):
 *
 * - ONE payload drives both the thermal (58/80mm) and A4 templates — the
 *   web app renders it, the Tauri hardware bridge (Phase 6) will render the
 *   same payload to ESC/POS.
 * - "Balance owed" on a receipt is THIS invoice's remaining due — fixing
 *   the legacy whole-customer-balance print (receipt_pos.php:96-101).
 * - Tender details are structured (MoMo provider/phone/reference, cheque
 *   bank/number) — never the dead accounts_used backfill.
 * - Reprint endpoints are read-only payloads; every PRINT is auditable by
 *   the client (the print action itself is a device event; Phase 6 adds the
 *   device-side audit rows).
 */
@Injectable()
export class ReceiptService {
  constructor(private readonly uow: UnitOfWork) {}

  /** Thermal/A4 receipt payload for a committed sale invoice. */
  invoiceReceipt(tenantId: string, invoiceId: string): Promise<ReceiptPayloadDto> {
    return this.uow.run({ tenantId }, (ctx) => this.buildInvoiceReceipt(ctx, invoiceId));
  }

  /** Thermal receipt payload for a standalone payment/deposit receipt. */
  paymentReceipt(tenantId: string, paymentId: string): Promise<ReceiptPayloadDto> {
    return this.uow.run({ tenantId }, (ctx) => this.buildPaymentReceipt(ctx, paymentId));
  }

  /** X/Z shift report payload (cashier day sheet). */
  shiftReport(tenantId: string, shiftId: string): Promise<Record<string, unknown>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const shift = await ctx.query<Record<string, unknown>>(
        `SELECT s.id, s.code, s.status, s.opening_float::text AS opening_float,
                s.opened_at, s.closed_at, s.expected_cash::text AS expected_cash,
                s.counted_cash::text AS counted_cash, s.variance::text AS variance,
                u.display_name AS user_name, w.name AS warehouse_name
         FROM cashier_shift s
         LEFT JOIN app_user u ON u.id = s.user_id
         LEFT JOIN warehouse w ON w.id = s.warehouse_id
         WHERE s.id = $1 AND s.tenant_id = $2`,
        [shiftId, ctx.tenantId],
      );
      if (shift.rows.length === 0) throw new NotFoundError('shift', shiftId);
      const payments = await ctx.query<Record<string, unknown>>(
        `SELECT method, COALESCE(SUM(t.amount),0)::text AS amount
         FROM payment_tender t JOIN payment p ON p.id = t.payment_id
         WHERE p.tenant_id = $1 AND p.shift_id = $2
         GROUP BY method ORDER BY method`,
        [ctx.tenantId, shiftId],
      );
      const sales = await ctx.query<Record<string, unknown>>(
        `SELECT count(*)::int AS count, COALESCE(SUM(total),0)::text AS total
         FROM invoice WHERE tenant_id = $1 AND shift_id = $2 AND status = 'posted'`,
        [ctx.tenantId, shiftId],
      );
      return {
        shift: shift.rows[0]!,
        sales: sales.rows[0]!,
        tendersByMethod: payments.rows.map((r) => ({ method: String(r.method), amount: String(r.amount) })),
      };
    });
  }

  /* ------------------------------- builders ------------------------------- */

  private async tenantHeader(ctx: UowContext) {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT name FROM tenant WHERE id = $1`,
      [ctx.tenantId],
    );
    const r = res.rows[0];
    return {
      businessName: r ? String(r.name) : 'iDepot',
      businessPhone: null as string | null,
      businessAddress: null as string | null,
    };
  }

  private async buildInvoiceReceipt(ctx: UowContext, invoiceId: string): Promise<ReceiptPayloadDto> {
    const invRes = await ctx.query<Record<string, unknown>>(
      `SELECT i.id, i.code, i.created_at, i.customer_id, c.name AS customer_name,
              c.phone AS customer_phone, i.subtotal::text AS subtotal,
              i.order_discount::text AS order_discount, i.total::text AS total,
              i.change_given::text AS change_given, i.note, u.display_name AS cashier
       FROM invoice i
       LEFT JOIN customer c ON c.id = i.customer_id
       LEFT JOIN app_user u ON u.id = i.created_by
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [invoiceId, ctx.tenantId],
    );
    if (invRes.rows.length === 0) throw new NotFoundError('invoice', invoiceId);
    const h = invRes.rows[0]!;

    const linesRes = await ctx.query<Record<string, unknown>>(
      `SELECT l.quantity::text AS quantity, l.unit_id, un.code AS unit_code,
              l.unit_price::text AS unit_price, l.line_net::text AS line_net,
              p.name AS product_name
       FROM invoice_line l
       JOIN product p ON p.id = l.product_id
       LEFT JOIN unit un ON un.id = l.unit_id
       WHERE l.invoice_id = $1
       ORDER BY l.sort_order, l.id`,
      [invoiceId],
    );

    const tenderRes = await ctx.query<Record<string, unknown>>(
      `SELECT t.method, t.amount::text AS amount, t.momo_provider, t.momo_phone,
              t.momo_transaction_id, t.cheque_bank, t.cheque_number, t.reference
       FROM payment_tender t
       JOIN payment p ON p.id = t.payment_id
       JOIN payment_allocation a ON a.payment_id = p.id
       WHERE a.invoice_id = $1
       ORDER BY t.created_at, t.id`,
      [invoiceId],
    );
    // credit tenders are not payments — show credit applications instead
    const creditRes = await ctx.query<Record<string, unknown>>(
      `SELECT COALESCE(SUM(ca.amount), 0)::text AS amount
       FROM credit_application ca WHERE ca.invoice_id = $1`,
      [invoiceId],
    );
    const creditAmountRaw = String(creditRes.rows[0]!.amount);
    // SUM over no rows renders as '0' (no fixed scale) — compare numerically
    const hasCredit = Number(creditAmountRaw) > 0;
    const creditAmount = hasCredit ? creditAmountRaw : null;
    const tenders: ReceiptPayloadDto['tenders'] = tenderRes.rows.map((t) => {
      const method = String(t.method);
      let detail: string | null = null;
      if (method === 'momo') {
        detail = [t.momo_provider, t.momo_phone, t.momo_transaction_id].filter(Boolean).join(' · ') || null;
      } else if (method === 'cheque') {
        detail = [t.cheque_bank, t.cheque_number].filter(Boolean).join(' · ') || null;
      } else if (method === 'bank_transfer') {
        detail = t.reference ? String(t.reference) : null;
      }
      return { method, amount: String(t.amount), detail };
    });
    if (hasCredit) {
      tenders.push({ method: 'credit', amount: creditAmount!, detail: 'customer credit' });
    }

    const dueRes = await ctx.query<{ due: string }>(
      `SELECT (i.total
         - COALESCE((SELECT SUM(a.amount) FROM payment_allocation a WHERE a.tenant_id = $1 AND a.invoice_id = i.id), 0)
         - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.tenant_id = $1 AND ca.invoice_id = i.id), 0))::text AS due
       FROM invoice i WHERE i.id = $2 AND i.tenant_id = $1`,
      [ctx.tenantId, invoiceId],
    );
    const due = dueRes.rows[0]!.due;

    const header = await this.tenantHeader(ctx);
    return {
      kind: 'receipt',
      ...header,
      code: String(h.code),
      occurredAt: new Date(h.created_at as string).toISOString(),
      customerName: h.customer_name ? String(h.customer_name) : null,
      customerPhone: h.customer_phone ? String(h.customer_phone) : null,
      cashierName: h.cashier ? String(h.cashier) : null,
      lines: linesRes.rows.map((l) => ({
        name: String(l.product_name),
        quantity: String(l.quantity),
        unitCode: l.unit_code ? String(l.unit_code) : null,
        unitPrice: String(l.unit_price),
        lineNet: String(l.line_net),
      })),
      subtotal: String(h.subtotal),
      orderDiscount: String(h.order_discount),
      total: String(h.total),
      tenders,
      changeGiven: String(h.change_given),
      amountDue: due !== '0.0000' ? due : String('0.0000'),
      balanceOwedThisInvoice: due,
      note: h.note ? String(h.note) : null,
    };
  }

  private async buildPaymentReceipt(ctx: UowContext, paymentId: string): Promise<ReceiptPayloadDto> {
    const payRes = await ctx.query<Record<string, unknown>>(
      `SELECT p.id, p.code, p.created_at, p.amount::text AS amount,
              p.change_given::text AS change_given, p.unapplied::text AS unapplied,
              c.name AS customer_name, c.phone AS customer_phone, u.display_name AS cashier
       FROM payment p
       LEFT JOIN customer c ON c.id = p.customer_id
       LEFT JOIN app_user u ON u.id = p.created_by
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [paymentId, ctx.tenantId],
    );
    if (payRes.rows.length === 0) throw new NotFoundError('payment', paymentId);
    const h = payRes.rows[0]!;

    const allocRes = await ctx.query<Record<string, unknown>>(
      `SELECT a.invoice_id, a.amount::text AS amount, i.code AS invoice_code
       FROM payment_allocation a LEFT JOIN invoice i ON i.id = a.invoice_id
       WHERE a.payment_id = $1 ORDER BY a.created_at`,
      [paymentId],
    );

    const tenderRes = await ctx.query<Record<string, unknown>>(
      `SELECT method, amount::text AS amount, momo_provider, momo_phone,
              momo_transaction_id, cheque_bank, cheque_number, reference
       FROM payment_tender WHERE payment_id = $1 ORDER BY created_at, id`,
      [paymentId],
    );
    const tenders: ReceiptPayloadDto['tenders'] = tenderRes.rows.map((t) => {
      const method = String(t.method);
      let detail: string | null = null;
      if (method === 'momo') {
        detail = [t.momo_provider, t.momo_phone, t.momo_transaction_id].filter(Boolean).join(' · ') || null;
      } else if (method === 'cheque') {
        detail = [t.cheque_bank, t.cheque_number].filter(Boolean).join(' · ') || null;
      } else if (method === 'bank_transfer') {
        detail = t.reference ? String(t.reference) : null;
      }
      return { method, amount: String(t.amount), detail };
    });

    const header = await this.tenantHeader(ctx);
    const applied = (allocRes.rows as Array<Record<string, unknown>>).reduce(
      (acc, a) => acc + Number(a.amount as string),
      0,
    );
    const unapplied = Number(h.unapplied as string);
    return {
      kind: 'receipt',
      ...header,
      code: String(h.code),
      occurredAt: new Date(h.created_at as string).toISOString(),
      customerName: h.customer_name ? String(h.customer_name) : null,
      customerPhone: h.customer_phone ? String(h.customer_phone) : null,
      cashierName: h.cashier ? String(h.cashier) : null,
      lines: allocRes.rows.map((a) => ({
        name: a.invoice_code ? `Invoice ${String(a.invoice_code)}` : 'On account (unapplied)',
        quantity: '1',
        unitCode: null,
        unitPrice: String(a.amount),
        lineNet: String(a.amount),
      })),
      subtotal: String(h.amount),
      orderDiscount: '0.0000',
      total: String(h.amount),
      tenders,
      changeGiven: String(h.change_given),
      amountDue: '0.0000',
      balanceOwedThisInvoice: '0.0000',
      note: applied === 0 && unapplied > 0 ? 'Customer deposit — unapplied credit' : null,
    };
  }
}
