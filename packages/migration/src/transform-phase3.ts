/**
 * Phase 3 transform: legacy sales cycle -> target sales documents.
 * Mapping per docs/migration/legacy-to-postgres-map.md §2 + §4:
 *
 *   sales_order + payment_with_goods (per so_code) -> sales_order + lines
 *   invoice (type sales)   -> invoice + lines (totals RECOMPUTED; D1-affected
 *                             amount_paid rebuilt from payment rows as
 *                             canonical evidence — correction-aware records)
 *   invoice ('Deposit-%')  -> customer_deposit (unapplied credit) + receipt
 *   proforma_invoice(_order) -> quotation + lines
 *   cash_deposit_disbursement -> credit_application
 *   invoice_code/waybill_code -> document_booklet import (verbatim codes)
 *
 * Correction-aware rules (strategy doc §3a — no silent repairs):
 *   D1  multi-account receipts multiply money: stored payment rows carry the
 *       receipt TOTAL per account. Reconstruction: true cash paid =
 *       invoice.amount − invoice.amount_due − Σ deposit disbursements
 *       (amount_due stays correct per the defect register; payment rows are
 *       evidence of the accounts used, not of the amounts).
 *   R14 per-row duplication of header fields: first-row-wins + divergence
 *       record when rows disagree.
 *   R8  Σ line amounts ≠ header grand_total (order discount baked in, never
 *       stored): the new invoice totals are SERVER-computed from lines
 *       (discount unknowable) — the discrepancy is recorded, never copied.
 *   D4  an invoice whose so_code has NO sales_order rows gets no lines —
 *       dual-table mismatch warning (legacy wrote both tables together).
 */
import type { PoolClient, Client } from 'pg';
import type { LegacyRow, Phase3TransformStats, ReconciliationRecord } from './types.js';
import { normalizeMoney } from './transform-phase2.js';
import { writeLegacyMap } from './transform-phase2.js';
import { divScaledRounded, formatScaled, mulScaled, parseScaled } from './exact.js';

export interface Phase3Options {
  tenantId: string;
  runId: string;
  /** item legacy id -> max package factor (base units per package) from the Phase 2 product import */
  maxFactorByItem: Map<string, bigint>;
  /** item legacy id -> new product id */
  productByItem: Map<string, string>;
  /** customer legacy id -> new customer id */
  customerByLegacy: Map<string, string>;
  /** fallback warehouse for imported documents (first imported store) */
  defaultWarehouseId: string;
  /** legacy store_id -> warehouse id (Phase 1 store import) */
  warehouseByStore: Map<string, string>;
}

export interface Phase3Result {
  stats: Phase3TransformStats;
  records: ReconciliationRecord[];
  warnings: Array<{ code: string; table: string; message: string }>;
}

function num(v: string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money4(n: number): string {
  return n.toFixed(4);
}

/** Postgres SQLSTATE of a driver error, when present. */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** legacy pay_method -> tender method (structured details where possible). */
function tenderMethod(payMethod: string | null | undefined): { method: string; provider?: string | null } {
  const m = (payMethod ?? 'CASH').toUpperCase();
  if (m.startsWith('MOMO')) {
    const provider = m.includes('VODAFONE') ? 'Vodafone' : m.includes('AIRTEL') || m.includes('TIGO') ? 'AirtelTigo' : 'MTN';
    return { method: 'momo', provider };
  }
  if (m.startsWith('CHEQUE')) return { method: 'cheque' };
  if (m.startsWith('BANK') || m.startsWith('TRANSFER')) return { method: 'bank_transfer' };
  return { method: 'cash' };
}

/**
 * Legacy sales rows transact in PACKAGE units; the base quantity is
 * quantity × package factor (+ nothing — sales carry no loose units). The
 * factor map is scaled at 10^6 (Phase 2 product import), so the product is
 * computed exactly in scaled space and re-scaled to 10^6 (half-even with
 * evidence when the ratio does not terminate — matching the opening-stock
 * authority path).
 */
function baseQuantity(
  opts: Phase3Options,
  itemId: string | null | undefined,
  rawQty: string | null | undefined,
): { value: string; factorUsed: boolean } {
  try {
    const qty = parseScaled(rawQty ?? '0', 6);
    const maxFactor = itemId ? opts.maxFactorByItem.get(itemId) : undefined;
    if (maxFactor == null) return { value: formatScaled(qty, 6), factorUsed: false };
    const product = mulScaled(qty, maxFactor); // scale 12
    return { value: formatScaled(divScaledRounded(product, 10n ** 6n), 6), factorUsed: true };
  } catch {
    return { value: '0.000000', factorUsed: false };
  }
}

function mulMoney(qty: number, price: number): string {
  return money4(qty * price);
}

/** strict legacy date parse: 'YYYY-MM-DD ...' -> 'YYYY-MM-DD', else null */
function parseLegacyDate(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : `${y}-${mo}-${d}`;
}

export async function transformSalesCycle(
  client: PoolClient | Client,
  soRows: LegacyRow[],
  pwgRows: LegacyRow[],
  invoiceRows: LegacyRow[],
  paymentRows: LegacyRow[],
  proformaRows: LegacyRow[],
  proformaLineRows: LegacyRow[],
  disbursementRows: LegacyRow[],
  invoiceCodeRows: LegacyRow[],
  waybillCodeRows: LegacyRow[],
  opts: Phase3Options,
): Promise<Phase3Result> {
  const stats: Phase3Result['stats'] = {
    ordersImported: 0, ordersReused: 0,
    invoicesImported: 0, invoicesReused: 0,
    paymentsImported: 0, paymentsReused: 0,
    depositsImported: 0, depositsReused: 0,
    creditApplications: 0,
    quotationsImported: 0, quotationsReused: 0,
    waybillsImported: 0, waybillsReused: 0,
    bookletCodesImported: 0,
    r14Divergences: 0,
    r8DiscountMismatches: 0,
    d1MultiaccountReconstructions: 0,
    legacyIdMapRowsPhase3: 0,
  };
  const records: ReconciliationRecord[] = [];
  const warnings: Array<{ code: string; table: string; message: string }> = [];

  const alreadyMapped = async (legacyTable: string, legacyId: string, targetTable: string): Promise<string | null> => {
    const m = await client.query<{ target_id: string }>(
      `SELECT target_id FROM legacy_id_map WHERE legacy_table = $1 AND legacy_id = $2 AND target_table = $3`,
      [legacyTable, legacyId, targetTable],
    );
    return m.rows[0]?.target_id ?? null;
  };

  await client.query('BEGIN');
  try {
    /* ---------------- group the sales cycle per so_code ---------------- */
    const bySo = new Map<string, LegacyRow[]>();
    for (const r of soRows) {
      const code = r.so_code ?? '';
      if (!code) continue;
      const list = bySo.get(code) ?? [];
      list.push(r);
      bySo.set(code, list);
    }

    const invoiceByCode = new Map<string, LegacyRow>();
    const invoiceById = new Map<string, LegacyRow>();
    const invoiceBySo = new Map<string, LegacyRow>();
    for (const inv of invoiceRows) {
      const code = inv.invoice_code ?? '';
      if (code) invoiceByCode.set(code, inv);
      if (inv.id) invoiceById.set(inv.id, inv);
      if (inv.so_code) invoiceBySo.set(inv.so_code, inv);
    }

    // deposit disbursements per invoice code (credit applied at invoicing)
    const disbByInvoice = new Map<string, LegacyRow[]>();
    for (const d of disbursementRows) {
      const key = d.invoice_code ?? '';
      if (!key) continue;
      const list = disbByInvoice.get(key) ?? [];
      list.push(d);
      disbByInvoice.set(key, list);
    }

    // D1 detection (multi-account receipt on ONE invoice): ≥2 payment rows
    // with the same receipt_code + same invoice, each carrying the receipt
    // total (defect register D1). Payments are evidence of ACCOUNTS only.
    const d1ReconstructedPaid = new Map<string, number>(); // invoice legacy id -> true cash paid
    const d1ReceiptCodes = new Set<string>();
    {
      const byReceipt = new Map<string, LegacyRow[]>();
      for (const p of paymentRows) {
        const rc = p.receipt_code ?? '';
        if (!rc) continue;
        const list = byReceipt.get(rc) ?? [];
        list.push(p);
        byReceipt.set(rc, list);
      }
      for (const [rc, rows] of byReceipt) {
        const sameInvoice = rows.filter((r) => r.invoice_id);
        const invoiceIds = new Set(sameInvoice.map((r) => r.invoice_id!));
        if (invoiceIds.size !== 1 || sameInvoice.length < 2) continue;
        const inv = invoiceById.get(sameInvoice[0]!.invoice_id!);
        if (!inv) continue;
        const creditApplied = (disbByInvoice.get(inv.invoice_code ?? '') ?? []).reduce((a, d) => a + Math.abs(num(d.amount)), 0);
        const truePaid = Math.max(num(inv.amount) - num(inv.amount_due) - creditApplied, 0);
        d1ReconstructedPaid.set(inv.id ?? '', truePaid);
        d1ReceiptCodes.add(rc);
        stats.d1MultiaccountReconstructions += 1;
        records.push({
          legacy_table: 'invoice',
          legacy_id: inv.id ?? '?',
          field: 'amount_paid',
          legacy_stored_value: {
            amount_paid: money4(num(inv.amount_paid)),
            payment_rows_total: money4(sameInvoice.reduce((a, r) => a + num(r.amount), 0)),
            accounts: sameInvoice.map((r) => r.method_account ?? r.pay_method ?? '?'),
          },
          legacy_reconstructed_value: {
            amount_paid: money4(truePaid),
            rule: 'amount − amount_due − Σ deposit disbursements (amount_due stays correct per defect register D1)',
          },
          new_system_value: {
            invoice_code: inv.invoice_code,
            total: money4(num(inv.amount)),
            payment_document_amount: money4(truePaid),
          },
          correction_delta: { amount_paid: money4(truePaid - num(inv.amount_paid)) },
          correction_reason: 'D1_MULTIACCOUNT_RECEIPT_TOTAL_MULTIPLIED',
          evidence: {
            defect: 'D1',
            source: 'Admin.php:17270-17438; payment-transaction-map §4',
            receipt_code: rc,
            payment_row_ids: sameInvoice.map((r) => r.id ?? '?'),
            disbursements: money4(creditApplied),
          },
          severity: 'critical',
          requires_manual_approval: true,
        });
      }
    }

    /* ------------------- sales orders + their invoices ------------------ */
    const waybillFulfillmentByCode = new Map<string, string>();
    for (const [soCode, rows] of bySo) {
      const head = rows[0]!;

      // R14 + R8 detection documents the LEGACY data — it must run on EVERY
      // run (before the reuse skip) so the reconciliation artifact is stable
      // and re-runs remain comparable.

      // R14: header fields must agree across rows (first-row-wins + record)
      const headerFields: Array<[string, string]> = [
        ['grand_total', head.grand_total ?? ''],
        ['amount_paid', head.amount_paid ?? ''],
        ['amount_due', head.amount_due ?? ''],
        ['status', head.status ?? ''],
      ];
      for (const [field, firstValue] of headerFields) {
        const divergent = rows.filter((r) => (r[field as keyof LegacyRow] ?? '') !== firstValue);
        if (divergent.length > 0) {
          stats.r14Divergences += 1;
          records.push({
            legacy_table: 'sales_order',
            legacy_id: soCode,
            field: `header.${field}`,
            legacy_stored_value: { rows: Object.fromEntries(rows.map((r) => [r.id ?? '?', r[field as keyof LegacyRow] ?? null])) },
            legacy_reconstructed_value: { rule: 'first-row-wins', value: firstValue },
            new_system_value: { so_code: soCode, [field]: firstValue },
            correction_delta: { divergent_rows: divergent.length },
            correction_reason: 'R14_ROW_HEADER_DIVERGENCE',
            evidence: { defect: 'R14', source: 'Admin.php:5916-5935', rows: rows.length },
            severity: 'high',
            requires_manual_approval: true,
          });
        }
      }

      // R8: Σ line amounts vs header grand_total
      const linesSum = rows.reduce((a, r) => a + num(r.amount), 0);
      const storedGrand = num(head.grand_total);
      const importedTotal = linesSum; // server-computed from lines (discount unknowable)
      if (Math.abs(linesSum - storedGrand) > 0.005) {
        stats.r8DiscountMismatches += 1;
        records.push({
          legacy_table: 'sales_order',
          legacy_id: soCode,
          field: 'grand_total',
          legacy_stored_value: { grand_total: money4(storedGrand) },
          legacy_reconstructed_value: { line_sum: money4(linesSum), rule: 'Σ row.amount (line amounts exclude the discount — defect register R8)' },
          new_system_value: { total: money4(importedTotal), order_discount: '0.0000' },
          correction_delta: { total: money4(importedTotal - storedGrand) },
          correction_reason: 'R8_DISCOUNT_TOTAL_MISMATCH',
          evidence: { defect: 'R8', source: 'invoice_print.php:361-383', rows: rows.length },
          severity: 'high',
          requires_manual_approval: true,
        });
      }

      const reused = await alreadyMapped('sales_order', soCode, 'sales_order');
      if (reused) {
        stats.ordersReused += 1;
        // invoice + waybill reuse is counted even when the order itself is
        // reused (the re-run must reconcile identical stats)
        const soInvoice = invoiceBySo.get(soCode);
        if (soInvoice && (await alreadyMapped('invoice', soInvoice.id ?? '', 'invoice'))) {
          stats.invoicesReused += 1;
        }
        const wbCodes = new Set(
          pwgRows.filter((w) => w.so_code === soCode && w.waybill_code).map((w) => w.waybill_code!),
        );
        for (const wb of wbCodes) {
          if (await alreadyMapped('payment_with_goods', `${soCode}:${wb}`, 'fulfillment')) {
            stats.waybillsReused += 1;
          }
        }
        continue;
      }
      if ((rows[0]?.opening_entry ?? '0') === '1') {
        // opening SOs are imported via the Phase 2 opening-balance documents
        warnings.push({ code: 'opening_entry_out_of_scope', table: 'sales_order', message: `so_code ${soCode}: opening rows are carried by the opening-balance documents, not re-imported` });
        continue;
      }

      const customerId = head.customer_id ? opts.customerByLegacy.get(head.customer_id) ?? null : null;
      const orderCode = soCode; // preserved verbatim (map §5)

      // the invoice for this so_code (legacy wrote one per sale; the invoice
      // links to the order via its so_code column — invoice_code differs).
      // The imported payment documents below carry the (D1-corrected) paid
      // state — invoice.amount_paid is legacy evidence, not copied.
      const inv = invoiceBySo.get(soCode);

      const warehouseId = (head.store_id ? opts.warehouseByStore.get(head.store_id) : null) ?? opts.defaultWarehouseId;
      const res = await client.query<{ id: string }>(
        `INSERT INTO sales_order
           (tenant_id, code, warehouse_id, customer_id, status, order_discount, subtotal, total, note, created_by)
         VALUES ($1,$2,$3,$4,$5,0,$6,$6,'imported from legacy so_code ' || $2, NULL)
         RETURNING id`,
        [opts.tenantId, orderCode, warehouseId, customerId, 'confirmed', money4(importedTotal)],
      );
      // legacy business date: first parseable row date, else today (recorded
      // in the notes via the R14/R8 evidence — never a silent date rewrite)
      const businessDate = parseLegacyDate(head.date_timestamp) ?? parseLegacyDate(rows[0]!.date_timestamp);
      const orderId = res.rows[0]!.id;
      await writeLegacyMap(client, 'sales_order', soCode, 'sales_order', orderId, opts.runId);

      let fullyPicked = true;
      for (const r of rows) {
        const product = r.item_id ? opts.productByItem.get(r.item_id) : null;
        if (!product) {
          warnings.push({ code: 'fk_orphan_item', table: 'sales_order', message: `so_code ${soCode} row ${r.id ?? '?'}: item ${r.item_id ?? '?'} not imported (orphan line skipped)` });
          continue;
        }
        const qty = num(r.quantity);
        const picked = num(r.quantity_picked);
        if (picked < qty) fullyPicked = false;
        await client.query<{ id: string }>(
          `INSERT INTO sales_order_line
             (tenant_id, order_id, product_id, quantity, quantity_base, unit_price, line_net, fulfilled_quantity_base, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(max(sort_order),0)+1 FROM sales_order_line WHERE order_id = $2))
           RETURNING id`,
          [
            opts.tenantId, orderId, product,
            qty.toFixed(6), baseQuantity(opts, r.item_id, r.quantity).value,
            normalizeMoney(r.price).value, mulMoney(qty, num(r.price)),
            baseQuantity(opts, r.item_id, r.quantity_picked).value,
          ],
        );
      }
      const soStatus = fullyPicked ? 'fulfilled' : 'partially_fulfilled';
      await client.query(`UPDATE sales_order SET status = $2 WHERE id = $1`, [orderId, soStatus]);

      // invoice + lines (totals server-computed)
      let invoiceId: string | null = null;
      if (inv) {
        const invReused = await alreadyMapped('invoice', inv.id ?? '', 'invoice');
        if (invReused) {
          invoiceId = invReused;
          stats.invoicesReused += 1;
        } else {
          // allocate an import-mode code: legacy invoice codes preserved verbatim
          const invRes = await client.query<{ id: string }>(
            `INSERT INTO invoice
               (tenant_id, code, sales_order_id, customer_id, warehouse_id, status,
                subtotal, order_discount, total, change_given, source, business_date)
             VALUES ($1,$2,$3,$4,$5,'posted', $6, 0, $6, 0, 'migration', $7::date)
             RETURNING id`,
            [opts.tenantId, inv.invoice_code ?? orderCode, orderId, customerId,
             warehouseId, money4(importedTotal), businessDate ?? null],
          );
          invoiceId = invRes.rows[0]!.id;
          await writeLegacyMap(client, 'invoice', inv.id ?? '', 'invoice', invoiceId, opts.runId);
          stats.invoicesImported += 1;

          for (const r of rows) {
            const product = r.item_id ? opts.productByItem.get(r.item_id) : null;
            if (!product) continue;
            const qty = num(r.quantity);
            await client.query(
              `INSERT INTO invoice_line
                 (tenant_id, invoice_id, product_id, quantity, quantity_base, unit_price, line_net,
                  resolved_price, price_source, price_overridden, cost_at_sale, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$6,'legacy_items_selling_price',true,$8,
                 (SELECT COALESCE(max(sort_order),0)+1 FROM invoice_line WHERE invoice_id = $2))`,
              [
                opts.tenantId, invoiceId, product,
                qty.toFixed(6), baseQuantity(opts, r.item_id, r.quantity).value,
                normalizeMoney(r.price).value, mulMoney(qty, num(r.price)),
                r.cost_price != null && r.cost_price !== '' ? normalizeMoney(r.cost_price).value : null,
              ],
            );
          }
        }
      }

      // link order -> invoice; the imported invoice payment state is carried
      // by the payment documents below (amountPaid is D1-corrected)
      if (invoiceId) {
        await client.query(`UPDATE sales_order SET invoice_id = $2 WHERE id = $1`, [orderId, invoiceId]);
      }
      stats.ordersImported += 1;

      /* -------- waybills: group PWG rows by waybill_code per so_code ----- */
      const waybills = new Map<string, LegacyRow[]>();
      for (const w of pwgRows.filter((w) => w.so_code === soCode && w.waybill_code)) {
        const list = waybills.get(w.waybill_code!) ?? [];
        list.push(w);
        waybills.set(w.waybill_code!, list);
      }
      const soLines = await client.query<{ id: string; product_id: string }>(
        `SELECT id, product_id FROM sales_order_line WHERE order_id = $1 ORDER BY id`, [orderId],
      );
      const lineByProduct = new Map(soLines.rows.map((l) => [l.product_id, l.id]));
      for (const [wbCode, wRows] of waybills) {
        // a waybill records PHYSICAL handover — zero-picked rows have nothing
        // to deliver (legacy wrote the mirror row regardless of picks)
        const deliverable = wRows.filter((w) => num(w.quantity_picked) > 0);
        if (deliverable.length === 0) continue;
        const wbReused = await alreadyMapped('payment_with_goods', `${soCode}:${wbCode}`, 'fulfillment');
        if (wbReused) { stats.waybillsReused += 1; waybillFulfillmentByCode.set(wbCode, wbReused); continue; }
        const wbRes = await client.query<{ id: string }>(
          `INSERT INTO fulfillment (tenant_id, code, sales_order_id, warehouse_id, status, note, created_by)
           VALUES ($1,$2,$3,$4,'delivered','imported legacy waybill', NULL)
           RETURNING id`,
          [opts.tenantId, wbCode, orderId, warehouseId],
        );
        const fulfillmentId = wbRes.rows[0]!.id;
        waybillFulfillmentByCode.set(wbCode, fulfillmentId);
        await writeLegacyMap(client, 'payment_with_goods', `${soCode}:${wbCode}`, 'fulfillment', fulfillmentId, opts.runId);
        for (const w of deliverable) {
          const product = w.item_id ? opts.productByItem.get(w.item_id) : null;
          const orderLineId = product ? lineByProduct.get(product) : null;
          if (!orderLineId) continue;
          await client.query(
            `INSERT INTO fulfillment_line (tenant_id, fulfillment_id, order_line_id, product_id, quantity_base)
             VALUES ($1,$2,$3,$4,$5)`,
            [opts.tenantId, fulfillmentId, orderLineId, product,
             baseQuantity(opts, w.item_id, w.quantity_picked).value],
          );
        }
        stats.waybillsImported += 1;
      }
    }

    /* ---------------- standalone invoices (no so_code group) ------------- */
    const groupedSoCodes = new Set(bySo.keys());
    for (const inv of invoiceRows) {
      const code = inv.invoice_code ?? '';
      // an invoice whose so_code group was imported already has its lines
      if (!code || groupedSoCodes.has(inv.so_code ?? '') || code.startsWith('Deposit-') || (inv.opening_entry ?? '0') === '1') continue;
      const reused = await alreadyMapped('invoice', inv.id ?? '', 'invoice');
      if (reused) { stats.invoicesReused += 1; continue; }
      warnings.push({ code: 'd4_dual_table_mismatch', table: 'invoice', message: `invoice ${code} (${inv.id ?? '?'}): no sales_order rows for its so_code — imported without lines (legacy wrote both tables together; see defects D4)` });
      const customerId = inv.customer_id ? opts.customerByLegacy.get(inv.customer_id) ?? null : null;
      const invRes = await client.query<{ id: string }>(
        `INSERT INTO invoice
           (tenant_id, code, customer_id, warehouse_id, status, subtotal, order_discount,
            total, change_given, source, business_date)
         VALUES ($1,$2,$3,$4,'posted', $5, 0, $5, 0, 'migration', CURRENT_DATE)
         RETURNING id`,
        [opts.tenantId, code, customerId,
         (inv.store_id ? opts.warehouseByStore.get(inv.store_id) : null) ?? opts.defaultWarehouseId,
         normalizeMoney(inv.amount).value],
      );
      const invoiceId = invRes.rows[0]!.id;
      await writeLegacyMap(client, 'invoice', inv.id ?? '', 'invoice', invoiceId, opts.runId);
      stats.invoicesImported += 1;
    }

    /* ----------------------- payments -> receipts ----------------------- */
    {
      const byReceipt = new Map<string, LegacyRow[]>();
      for (const p of paymentRows) {
        const rc = p.receipt_code ?? '';
        if (!rc) continue;
        const list = byReceipt.get(rc) ?? [];
        list.push(p);
        byReceipt.set(rc, list);
      }
      for (const [rc, rows] of byReceipt) {
        const reused = await alreadyMapped('payment', rc, 'payment');
        if (reused) { stats.paymentsReused += 1; continue; }

        // D1-affected receipt: stored amounts are corrupted (N × total);
        // ONE reconstructed payment per affected invoice with the evidence.
        if (rows.some((r) => r.invoice_id && d1ReceiptCodes.has(rc))) {
          const seenInvoices = new Set<string>();
          for (const r of rows) {
            const inv = r.invoice_id ? invoiceById.get(r.invoice_id) : null;
            if (!inv || seenInvoices.has(inv.id ?? '')) continue;
            seenInvoices.add(inv.id ?? '');
            const truePaid = d1ReconstructedPaid.get(inv.id ?? '') ?? 0;
            const invoiceId = await alreadyMapped('invoice', inv.id ?? '', 'invoice');
            if (!invoiceId || truePaid <= 0) continue;
            const customerId = inv.customer_id ? opts.customerByLegacy.get(inv.customer_id) ?? null : null;
            const payRes = await client.query<{ id: string }>(
              `INSERT INTO payment
                 (tenant_id, code, customer_id, amount, change_given, unapplied, source, business_date)
               VALUES ($1,$2,$3,$4,0,0,'migration',CURRENT_DATE) RETURNING id`,
              [opts.tenantId, rc, customerId, money4(truePaid)],
            );
            const paymentId = payRes.rows[0]!.id;
            await writeLegacyMap(client, 'payment', rc, 'payment', paymentId, opts.runId);
            await client.query(
              `INSERT INTO payment_tender (tenant_id, payment_id, method, amount, reference)
               VALUES ($1,$2,'cash',$3,'D1-corrected reconstruction (legacy payment rows carried the receipt total per account)')`,
              [opts.tenantId, paymentId, money4(truePaid)],
            );
            await client.query(
              `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_id, amount)
               VALUES ($1,$2,$3,$4)`,
              [opts.tenantId, paymentId, invoiceId, money4(truePaid)],
            );
            stats.paymentsImported += 1;
          }
          continue;
        }

        // clean receipt: payment rows are the tender evidence (per row)
        const total = rows.reduce((a, r) => a + num(r.amount), 0);
        if (total <= 0) continue;
        const firstInv = rows.find((r) => r.invoice_id);
        const inv = firstInv ? invoiceById.get(firstInv.invoice_id!) : null;
        const customerId = (inv?.customer_id ?? rows[0]!.customer_id)
          ? opts.customerByLegacy.get((inv?.customer_id ?? rows[0]!.customer_id)!) ?? null
          : null;
        const payRes = await client.query<{ id: string }>(
          `INSERT INTO payment
             (tenant_id, code, customer_id, amount, change_given, unapplied, source, business_date)
           VALUES ($1,$2,$3,$4,0,0,'migration',CURRENT_DATE) RETURNING id`,
          [opts.tenantId, rc, customerId, money4(total)],
        );
        const paymentId = payRes.rows[0]!.id;
        await writeLegacyMap(client, 'payment', rc, 'payment', paymentId, opts.runId);
        for (const r of rows) {
          const { method, provider } = tenderMethod(r.method_account ?? r.pay_method);
          await client.query(
            `INSERT INTO payment_tender
               (tenant_id, payment_id, method, amount, momo_provider, momo_phone,
                momo_transaction_id, cheque_bank, cheque_branch, cheque_number, reference)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              opts.tenantId, paymentId, method, normalizeMoney(r.amount).value,
              provider ?? null, r.momo_phone ?? null, r.momo_transaction_id ?? null,
              r.bank_name ?? null, r.branch ?? null, r.cheque_number ?? null,
              r.track_code ? `legacy track ${r.track_code}` : null,
            ],
          );
        }
        // allocation across invoices. D1 multi-INVOICE receipts (the Phase 1
        // fixture case): the stored per-row amounts are corrupted (receipt
        // total per row), so the receipt amount and the per-invoice shares
        // are RECONSTRUCTED with the same rule the reconciliation records
        // use (share = invoice amount; amount_due stayed correct) — never
        // the corrupted row sums. Clean receipts keep their row amounts.
        const involved = [...new Set(rows.map((r) => r.invoice_id).filter((x): x is string => !!x))]
          .map((id) => invoiceById.get(id))
          .filter((i): i is LegacyRow => Boolean(i));
        const isD1MultiInvoice = involved.length > 1;
        const receiptAmount = isD1MultiInvoice
          ? involved.reduce((a, i) => a + num(i.amount), 0)
          : total;
        if (receiptAmount !== total) {
          await client.query(`UPDATE payment SET amount = $3 WHERE id = $1 AND tenant_id = $2`, [paymentId, opts.tenantId, money4(receiptAmount)]);
        }
        for (const i of involved) {
          const invoiceId = await alreadyMapped('invoice', i.id ?? '', 'invoice');
          if (!invoiceId) continue;
          const share = isD1MultiInvoice
            ? num(i.amount)
            : (() => { const sumAmounts = involved.reduce((a, x) => a + num(x.amount), 0); return sumAmounts > 0 ? num(i.amount) / sumAmounts : 1 / involved.length; })();
          await client.query(
            `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_id, amount)
             VALUES ($1,$2,$3,$4)`,
            [opts.tenantId, paymentId, invoiceId, isD1MultiInvoice ? money4(share) : money4(total * share)],
          );
        }
        if (isD1MultiInvoice) {
          // one merged cash tender carrying the reconstruction evidence
          await client.query(`DELETE FROM payment_tender WHERE payment_id = $1 AND tenant_id = $2`, [paymentId, opts.tenantId]);
          await client.query(
            `INSERT INTO payment_tender (tenant_id, payment_id, method, amount, reference)
             VALUES ($1,$2,'cash',$3,'D1-corrected multi-invoice receipt (legacy rows carried the receipt total per invoice)')`,
            [opts.tenantId, paymentId, money4(receiptAmount)],
          );
        }
        stats.paymentsImported += 1;
      }
    }

    /* ------------- deposits (legacy negative invoice rows) --------------- */
    for (const inv of invoiceRows) {
      const code = inv.invoice_code ?? '';
      if (!code.startsWith('Deposit-')) continue;
      const reused = await alreadyMapped('invoice', inv.id ?? '', 'customer_deposit');
      if (reused) { stats.depositsReused += 1; continue; }
      const amount = Math.abs(num(inv.amount));
      if (amount <= 0) continue;
      const customerId = inv.customer_id ? opts.customerByLegacy.get(inv.customer_id) ?? null : null;
      // the money arrives as a receipt; the credit is the liability document.
      // When a legacy payment row already funds this deposit (payment_type
      // 'Deposit'), REUSE that receipt — creating a second one would
      // double-count the money.
      const fundingRow = paymentRows.find((p) => p.invoice_id === (inv.id ?? '') && (p.payment_type ?? '').toLowerCase() === 'deposit');
      let paymentId: string | null = null;
      if (fundingRow?.receipt_code) {
        paymentId = await alreadyMapped('payment', fundingRow.receipt_code, 'payment');
      }
      if (!paymentId) {
        const payRes = await client.query<{ id: string }>(
          `INSERT INTO payment
             (tenant_id, code, customer_id, amount, change_given, unapplied, source, business_date)
           VALUES ($1,$2,$3,$4,0,$4,'migration',CURRENT_DATE) RETURNING id`,
          [opts.tenantId, `RCT-${code}`, customerId, money4(amount)],
        );
        paymentId = payRes.rows[0]!.id;
        await client.query(
          `INSERT INTO payment_tender (tenant_id, payment_id, method, amount, reference)
           VALUES ($1,$2,'cash',$3,'legacy deposit receipt')`,
          [opts.tenantId, paymentId, money4(amount)],
        );
        stats.paymentsImported += 1;
      }
      const depRes = await client.query<{ id: string }>(
        `INSERT INTO customer_deposit
           (tenant_id, code, customer_id, amount, payment_id, note, business_date)
         VALUES ($1,$2,$3,$4,$5,'imported legacy deposit (negative invoice row)',CURRENT_DATE)
         RETURNING id`,
        [opts.tenantId, code, customerId, money4(amount), paymentId],
      );
      const depositId = depRes.rows[0]!.id;
      await writeLegacyMap(client, 'invoice', inv.id ?? '', 'customer_deposit', depositId, opts.runId);
      await writeLegacyMap(client, 'invoice_code', code, 'customer_deposit', depositId, opts.runId);
      stats.depositsImported += 1;
    }

    /* --------------- deposit disbursements -> credit applications -------- */
    for (const d of disbursementRows) {
      const depositCode = d.deposit_code ?? '';
      const invoiceCode = d.invoice_code ?? '';
      if (!depositCode || !invoiceCode) continue;
      const depositId = await alreadyMapped('invoice_code', depositCode, 'customer_deposit');
      const invoiceId = await alreadyMapped('invoice', invoiceCode, 'invoice')
        ?? await (async () => {
          const inv = invoiceByCode.get(invoiceCode);
          return inv ? alreadyMapped('invoice', inv.id ?? '', 'invoice') : null;
        })();
      if (!depositId || !invoiceId) {
        warnings.push({ code: 'fk_orphan_disbursement', table: 'cash_deposit_disbursement', message: `disbursement ${d.id ?? '?'}: deposit or invoice not imported` });
        continue;
      }
      const exists = await client.query(
        `SELECT 1 FROM credit_application WHERE deposit_id = $1 AND invoice_id = $2`,
        [depositId, invoiceId],
      );
      if (exists.rowCount) continue;
      await client.query(
        `INSERT INTO credit_application (tenant_id, deposit_id, invoice_id, amount)
         VALUES ($1,$2,$3,$4)`,
        [opts.tenantId, depositId, invoiceId, normalizeMoney(d.amount).value],
      );
      stats.creditApplications += 1;
    }

    /* --------------------- proforma -> quotations ------------------------ */
    for (const p of proformaRows) {
      const reused = await alreadyMapped('proforma_invoice', p.id ?? '', 'quotation');
      if (reused) { stats.quotationsReused += 1; continue; }
      const lines = proformaLineRows.filter((l) => l.so_code === p.so_code);
      const linesSum = lines.reduce((a, l) => a + num(l.amount), 0);
      const customerId = p.customer_id ? opts.customerByLegacy.get(p.customer_id) ?? null : null;
      const qRes = await client.query<{ id: string }>(
        `INSERT INTO quotation (tenant_id, code, warehouse_id, customer_id, status, note)
         VALUES ($1,$2,$3,$4,'draft','imported legacy proforma') RETURNING id`,
        [opts.tenantId, p.invoice_code ?? p.so_code ?? `PMF-${p.id ?? '?'}`,
         opts.defaultWarehouseId, customerId],
      );
      const quotationId = qRes.rows[0]!.id;
      await writeLegacyMap(client, 'proforma_invoice', p.id ?? '', 'quotation', quotationId, opts.runId);
      for (const l of lines) {
        const product = l.item_id ? opts.productByItem.get(l.item_id) : null;
        if (!product) continue;
        const qty = num(l.quantity);
        await client.query(
          `INSERT INTO quotation_line
             (tenant_id, quotation_id, product_id, quantity, quantity_base, unit_price, line_net, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,
             (SELECT COALESCE(max(sort_order),0)+1 FROM quotation_line WHERE quotation_id = $2))`,
          [opts.tenantId, quotationId, product, qty.toFixed(6),
           baseQuantity(opts, l.item_id, l.quantity).value,
           normalizeMoney(l.price).value, mulMoney(qty, num(l.price))],
        );
      }
      void linesSum;
      stats.quotationsImported += 1;
    }

    /* ------------------ booklets (verbatim pre-printed codes) ------------ */
    for (const [table, docType] of [['invoice_code', 'INVOICE'], ['waybill_code', 'WAYBILL']] as const) {
      const rows = table === 'invoice_code' ? invoiceCodeRows : waybillCodeRows;
      if (rows.length === 0) continue;
      // idempotency: once this tenant has imported booklet codes of THIS
      // doc type, a re-run must not spawn a second (partially filled) booklet
      const existingBooklet = await client.query(
        `SELECT 1 FROM document_booklet_code c
         JOIN document_booklet b ON b.id = c.booklet_id
         WHERE c.tenant_id = $1 AND b.doc_type = $2 LIMIT 1`,
        [opts.tenantId, docType],
      );
      if (existingBooklet.rowCount) {
        continue; // codes were imported on the first run only
      }
      const bRes = await client.query<{ id: string }>(
        `INSERT INTO document_booklet (tenant_id, doc_type, code_range, source)
         VALUES ($1,$2,'legacy import','imported') RETURNING id`,
        [opts.tenantId, docType],
      );
      const bookletId = bRes.rows[0]!.id;
      let seq = 0;
      for (const r of rows) {
        seq += 1;
        const status = (r.status ?? 'open').toLowerCase() === 'closed'
          ? 'allocated'
          : (r.status ?? '').toLowerCase().includes('not') ? 'not_used' : 'open';
        // closed legacy codes point at the imported document when one matches
        let allocatedDoc: string | null = null;
        if (status === 'allocated') {
          if (docType === 'INVOICE') {
            const inv = invoiceByCode.get(r.code ?? '');
            allocatedDoc = inv ? await alreadyMapped('invoice', inv.id ?? '', 'invoice') : null;
          } else {
            allocatedDoc = waybillFulfillmentByCode.get(r.code ?? '') ?? null;
          }
        }
        await client.query(
          `INSERT INTO document_booklet_code
             (tenant_id, booklet_id, seq, code, status, reason, allocated_document_type, allocated_document_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id, code) DO NOTHING`,
          [opts.tenantId, bookletId, seq, r.code ?? '', status,
           r.reason ?? null, status === 'allocated' ? docType.toLowerCase() : null, allocatedDoc],
        );
        stats.bookletCodesImported += 1;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (pgCode(err) === '23505') {
      // unique violation inside the sales import — surface as a loud failure
      throw new Error(`phase3 sales import produced a duplicate document: ${(err as Error).message}`);
    }
    throw err;
  }

  stats.legacyIdMapRowsPhase3 =
    stats.ordersImported + stats.ordersReused +
    stats.invoicesImported + stats.invoicesReused +
    stats.paymentsImported + stats.paymentsReused +
    stats.depositsImported + stats.depositsReused +
    stats.quotationsImported + stats.quotationsReused +
    stats.waybillsImported + stats.waybillsReused;

  return { stats, records, warnings };
}
