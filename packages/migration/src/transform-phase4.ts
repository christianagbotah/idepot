/**
 * Phase 4 transform: legacy purchasing / AP / banking -> the corrected
 * target model, plus the opening trial balance.
 *
 * Mapping per docs/migration/legacy-to-postgres-map.md and the strategy
 * doc §3a (correction-aware, never silent):
 *
 *   purchase_order (rows per po_code, header fields duplicated — R14)
 *     -> purchase_order + purchase_order_line (historical, received =
 *        ordered; the legacy app added stock on PO save, and the Phase 2
 *        opening-stock import already brought the QUANTITIES in — so
 *        Phase 4 imports the commitment + receipt EVIDENCE only, never
 *        a second stock movement)
 *     -> supplier_invoice per po_code (AP side; totals RECOMPUTED from
 *        lines, R14 first-row-wins with divergence records)
 *     -> supplier_payment + allocation for the legacy amount_paid
 *        (historical evidence; no GL journal — the new GL opens from
 *        the opening trial balance, D8/D9)
 *
 *   accounts (chart-of-accounts-as-payment-methods)
 *     -> gl_account (asset) + bank_account for transferrable rows —
 *        the corrected banking master; legacy current_balance is
 *        reconciled (drift recorded), never copied as truth
 *
 *   suppliers.opening_balance
 *     -> party_opening_balance documents (the explicit opening-balance
 *        document the corrected model requires)
 *
 *   general_journal
 *     -> REFERENCE ONLY: counted and reconciled (ΣD vs ΣC reported as
 *        informational drift); never imported as canonical truth
 *
 * Opening trial balance: built from canonical opening documents (stock
 * value, AR/AP openings, imported open invoices, legacy cash/bank
 * balances) and POSTED as a single migration-opening journal. Any
 * residual imbalance is the EXPLICIT, quantified equity plug — recorded
 * as a reconciliation record requiring manual (accountant) approval.
 */
import type { PoolClient, Client } from 'pg';
import type { LegacyRow, Phase4TransformStats, ReconciliationRecord } from './types.js';
import { findMappedId, writeLegacyMap, normalizeMoney } from './transform-phase2.js';
import { parseScaled, formatScaled } from './exact.js';

export interface Phase4Options {
  tenantId: string;
  runId: string;
  /** legacy supplier id -> new supplier id */
  supplierByLegacy: Map<string, string>;
  /** legacy item id -> new product id */
  productByItem: Map<string, string>;
  /** fallback warehouse (Phase 1 store import) */
  defaultWarehouseId: string;
}

export interface Phase4Result {
  stats: Phase4TransformStats;
  records: ReconciliationRecord[];
  warnings: Array<{ code: string; table: string; message: string }>;
}

function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function dec(v: string | null | undefined): bigint {
  // legacy DOUBLE cells arrive as text; normalize half-even to 4dp
  if (v == null || v.trim() === '') return 0n;
  try {
    return parseScaled(normalizeMoney(v).value, 4);
  } catch {
    return 0n;
  }
}

function isoDate(v: string | null | undefined): string {
  if (v == null) return '1970-01-01';
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '1970-01-01';
}

/** slugify a legacy account name into a stable GL code prefix */
function accountCode(name: string, seq: number): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6);
  return `L${String(seq).padStart(2, '0')}-${slug || 'ACCT'}`;
}

export async function transformPhase4(
  client: PoolClient | Client,
  rows: {
    purchaseOrder: LegacyRow[];
    accountsPayable: LegacyRow[];
    accounts: LegacyRow[];
    generalJournal: LegacyRow[];
    suppliers: LegacyRow[];
  },
  opts: Phase4Options,
): Promise<Phase4Result> {
  const stats: Phase4TransformStats = {
    purchaseOrdersImported: 0,
    purchaseOrdersReused: 0,
    supplierInvoicesImported: 0,
    supplierInvoicesReused: 0,
    supplierPaymentsImported: 0,
    supplierPaymentsReused: 0,
    bankAccountsImported: 0,
    bankAccountsReused: 0,
    supplierOpeningsImported: 0,
    journalReferenceRows: rows.generalJournal.length,
    r14Divergences: 0,
    openingTbPosted: false,
    equityPlug: '0.0000',
    openingTbDebit: '0.0000',
    openingTbCredit: '0.0000',
    legacyIdMapRowsPhase4: 0,
  };
  const records: ReconciliationRecord[] = [];
  const warnings: Array<{ code: string; table: string; message: string }> = [];
  void pgCode;

  await client.query('BEGIN');
  try {
    // ---- 1. banking master: legacy accounts -> gl_account + bank_account --
    let accountSeq = 0;
    for (const acc of rows.accounts) {
      const legacyId = String(acc.account_id ?? '');
      const transferrable = (acc.account_is_transferrable ?? '0').trim() === '1';
      if (!transferrable) continue; // non-transferrable legacy rows are not payment methods
      accountSeq += 1;
      const code = accountCode(String(acc.name ?? `acct${legacyId}`), accountSeq);
      const reusedGl = await findMappedId(client, 'accounts', legacyId, 'gl_account', 'gl_account', opts.tenantId);
      let glAccountId: string;
      if (reusedGl) {
        glAccountId = reusedGl;
      } else {
        const res = await client.query<{ id: string }>(
          `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance, description)
           VALUES ($1,$2,$3,'asset','asset','debit',$4)
           ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [opts.tenantId, code, String(acc.name ?? `legacy account ${legacyId}`), 'imported from legacy accounts row (banking master)'],
        );
        glAccountId = res.rows[0]!.id;
        await writeLegacyMap(client, 'accounts', legacyId, 'gl_account', glAccountId, opts.runId);
        stats.legacyIdMapRowsPhase4 += 1;
      }
      const reusedBank = await findMappedId(client, 'accounts', legacyId, 'bank_account', 'bank_account', opts.tenantId);
      // legacy current_balance is a MUTABLE SNAPSHOT (defect C-31 class) —
      // recorded as drift, never copied as truth (every run: evidence about
      // the legacy data, not about this run's inserts)
      const current = dec(acc.current_balance);
      records.push({
        legacy_table: 'accounts',
        legacy_id: legacyId,
        field: 'current_balance',
        legacy_stored_value: { currentBalance: formatScaled(current, 4) },
        legacy_reconstructed_value: { currentBalance: formatScaled(current, 4) },
        new_system_value: { glBalance: '0.0000' },
        correction_delta: { drift: formatScaled(current, 4) },
        correction_reason: 'LEGACY_BANK_BALANCE_SNAPSHOT_DRIFT',
        evidence: {
          defect: 'C-31/A2: legacy current_balance is an incrementally-mutated snapshot; the new GL opens from the opening trial balance',
        },
        severity: 'warning',
        requires_manual_approval: false,
      });
      if (reusedBank) {
        stats.bankAccountsReused += 1;
      } else {
        await client.query(
          `INSERT INTO bank_account (tenant_id, code, bank_name, account_name, account_number, currency, gl_account_id)
           VALUES ($1,$2,$3,$4,$5,'GHS',$6)`,
          [opts.tenantId, code, String(acc.name ?? 'legacy'), String(acc.name ?? 'legacy'), `legacy-${legacyId}`, glAccountId],
        );
        const bankId = (
          await client.query<{ id: string }>(`SELECT id FROM bank_account WHERE tenant_id = $1 AND code = $2`, [
            opts.tenantId,
            code,
          ])
        ).rows[0]!.id;
        await writeLegacyMap(client, 'accounts', legacyId, 'bank_account', bankId, opts.runId);
        stats.legacyIdMapRowsPhase4 += 1;
        stats.bankAccountsImported += 1;
      }
    }

    // ---- 2. supplier opening balances -> explicit documents ---------------
    for (const sup of rows.suppliers) {
      const legacyId = String(sup.supplier_id ?? '');
      const newId = opts.supplierByLegacy.get(legacyId);
      if (newId == null) continue;
      const opening = dec(sup.opening_balance);
      if (opening === 0n) continue;
      const reused = await findMappedId(client, 'suppliers_opening', legacyId, 'party_opening_balance', 'party_opening_balance', opts.tenantId);
      const balanceDue = dec(sup.balance_due);
      if (balanceDue !== opening) {
        records.push({
          legacy_table: 'suppliers',
          legacy_id: legacyId,
          field: 'opening_balance_vs_balance_due',
          legacy_stored_value: { balanceDue: formatScaled(balanceDue, 4) },
          legacy_reconstructed_value: { openingBalance: formatScaled(opening, 4) },
          new_system_value: { openingDocument: formatScaled(opening, 4) },
          correction_delta: { drift: formatScaled(balanceDue - opening, 4) },
          correction_reason: 'SUPPLIER_OPENING_BALANCE_DIVERGENCE',
          evidence: { note: 'opening_balance is the opening document authority; balance_due is a derived legacy snapshot' },
          severity: 'warning',
          requires_manual_approval: false,
        });
      }
      if (reused) continue;
      await client.query(
        `INSERT INTO party_opening_balance (tenant_id, party_type, party_id, amount, note, source, status)
         VALUES ($1,'supplier',$2,$3,$4,'migration',$5)`,
        [opts.tenantId, newId, formatScaled(opening, 4), 'legacy supplier opening balance (migration)', 'posted'],
      );
      const pobId = (
        await client.query<{ id: string }>(
          `SELECT id FROM party_opening_balance WHERE tenant_id = $1 AND party_type = 'supplier' AND party_id = $2 AND source = 'migration'`,
          [opts.tenantId, newId],
        )
      ).rows[0]!.id;
      await writeLegacyMap(client, 'suppliers_opening', legacyId, 'party_opening_balance', pobId, opts.runId);
      stats.legacyIdMapRowsPhase4 += 1;
      stats.supplierOpeningsImported += 1;
    }

    // ---- 3. legacy purchase orders -> PO + lines + invoice + payment ------
    const byPoCode = new Map<string, LegacyRow[]>();
    for (const row of rows.purchaseOrder) {
      const code = String(row.po_code ?? '');
      const list = byPoCode.get(code) ?? [];
      list.push(row);
      byPoCode.set(code, list);
    }
    const payableByPoCode = new Map<string, LegacyRow>();
    for (const ap of rows.accountsPayable) {
      payableByPoCode.set(String(ap.po_code ?? ''), ap);
    }

    for (const [poCode, poRows] of byPoCode) {
      if (poCode === '') continue;
      const first = poRows[0]!;
      const supplierId = opts.supplierByLegacy.get(String(first.supplier_id ?? ''));
      if (supplierId == null) {
        warnings.push({ code: 'fk_orphan', table: 'purchase_order', message: `po_code ${poCode} references an unimported supplier` });
        continue;
      }

      // R14: header fields duplicated per row — first-row-wins + divergence
      let grandTotal = dec(first.grand_total);
      let amountPaid = dec(first.amount_paid);
      for (const row of poRows.slice(1)) {
        if (dec(row.grand_total) !== grandTotal || dec(row.amount_paid) !== amountPaid) {
          stats.r14Divergences += 1;
          records.push({
            legacy_table: 'purchase_order',
            legacy_id: String(row.po_id ?? ''),
            field: 'grand_total/amount_paid',
            legacy_stored_value: { grandTotal: formatScaled(dec(row.grand_total), 4), amountPaid: formatScaled(dec(row.amount_paid), 4) },
            legacy_reconstructed_value: { grandTotal: formatScaled(grandTotal, 4), amountPaid: formatScaled(amountPaid, 4) },
            new_system_value: { grandTotal: formatScaled(grandTotal, 4), amountPaid: formatScaled(amountPaid, 4) },
            correction_delta: {
              grandTotalDrift: formatScaled(dec(row.grand_total) - grandTotal, 4),
              amountPaidDrift: formatScaled(dec(row.amount_paid) - amountPaid, 4),
            },
            correction_reason: 'R14_HEADER_FIELDS_DUPLICATED_PER_ROW',
            evidence: { firstRowPoId: String(first.po_id ?? ''), divergentRowPoId: String(row.po_id ?? '') },
            severity: 'warning',
            requires_manual_approval: false,
          });
          // first-row-wins
        }
      }

      // computed total from lines (canonical: server-computed)
      let lineTotal = 0n;
      for (const row of poRows) {
        lineTotal += dec(row.amount);
      }

      const reusedPo = await findMappedId(client, 'purchase_order', poCode, 'purchase_order', 'purchase_order', opts.tenantId);
      let purchaseOrderId: string;
      let poCode2 = `MIG-${poCode}`;
      if (reusedPo) {
        purchaseOrderId = reusedPo;
        stats.purchaseOrdersReused += 1;
      } else {
        const res = await client.query<{ id: string }>(
          `INSERT INTO purchase_order (tenant_id, code, supplier_id, warehouse_id, status, notes, created_by)
           VALUES ($1,$2,$3,$4,'closed',$5,NULL) RETURNING id`,
          [opts.tenantId, poCode2, supplierId, opts.defaultWarehouseId, 'imported from legacy purchase_order (historical; stock came via the Phase 2 opening-stock import)'],
        );
        purchaseOrderId = res.rows[0]!.id;
        await writeLegacyMap(client, 'purchase_order', poCode, 'purchase_order', purchaseOrderId, opts.runId);
        stats.legacyIdMapRowsPhase4 += 1;
        stats.purchaseOrdersImported += 1;

        for (const row of poRows) {
          const productId = opts.productByItem.get(String(row.item_id ?? ''));
          if (productId == null) {
            warnings.push({ code: 'fk_orphan', table: 'purchase_order', message: `po_code ${poCode} line references an unimported item ${row.item_id}` });
            continue;
          }
          const qty = dec(row.quantity);
          const price = dec(row.price);
          await client.query(
            `INSERT INTO purchase_order_line
               (tenant_id, purchase_order_id, product_id, ordered_quantity, conversion_factor,
                ordered_quantity_base, unit_price, received_quantity_base, invoiced_quantity_base)
             VALUES ($1,$2,$3,$4,1,$5,$6,$5,$5)`,
            [opts.tenantId, purchaseOrderId, productId, formatScaled(qty, 4), formatScaled(qty, 4), formatScaled(price, 4)],
          );
        }
      }
      void poCode2;

      // supplier invoice (AP side) — per po_code
      const apRow = payableByPoCode.get(poCode);
      const invoiceTotal = lineTotal;
      // R8-class: header grand_total vs Σ lines (evidence per po_code, every run)
      if (grandTotal !== lineTotal) {
        records.push({
          legacy_table: 'purchase_order',
          legacy_id: poCode,
          field: 'grand_total_vs_lines',
          legacy_stored_value: { grandTotal: formatScaled(grandTotal, 4) },
          legacy_reconstructed_value: { lineTotal: formatScaled(lineTotal, 4) },
          new_system_value: { invoiceTotal: formatScaled(lineTotal, 4) },
          correction_delta: { drift: formatScaled(grandTotal - lineTotal, 4) },
          correction_reason: 'R8_HEADER_TOTAL_VS_LINE_SUM_MISMATCH',
          evidence: { note: 'new invoice totals are server-computed from lines; the legacy header figure is evidence' },
          severity: 'warning',
          requires_manual_approval: false,
        });
      }
      const reusedInv = await findMappedId(client, 'accounts_payable', poCode, 'supplier_invoice', 'supplier_invoice', opts.tenantId);
      let invoiceId: string | null = null;
      if (reusedInv) {
        invoiceId = reusedInv;
        stats.supplierInvoicesReused += 1;
      } else if (invoiceTotal > 0n) {
        const invCode = `MSI-${poCode}`;
        const businessDate = isoDate(first.date_timestamp);
        const res = await client.query<{ id: string }>(
          `INSERT INTO supplier_invoice
             (tenant_id, code, supplier_id, supplier_invoice_number, supplier_invoice_date, due_date,
              business_date, purchase_order_id, status, match_state, subtotal, tax_total, tax_inclusive_total, total, notes)
           VALUES ($1,$2,$3,$4,$5,$5,$5,$6,'posted','no_po',$7,0,0,$7,$8)
           ON CONFLICT (tenant_id, code) DO NOTHING RETURNING id`,
          [
            opts.tenantId, invCode, supplierId, poCode, businessDate, purchaseOrderId,
            formatScaled(invoiceTotal, 4), 'imported from legacy purchase_order/accounts_payable (historical AP)',
          ],
        );
        if (res.rows[0] != null) {
          invoiceId = res.rows[0]!.id;
          await writeLegacyMap(client, 'accounts_payable', poCode, 'supplier_invoice', invoiceId, opts.runId);
          stats.legacyIdMapRowsPhase4 += 1;
          stats.supplierInvoicesImported += 1;
        } else {
          invoiceId = (
            await client.query<{ id: string }>(`SELECT id FROM supplier_invoice WHERE tenant_id = $1 AND code = $2`, [
              opts.tenantId,
              invCode,
            ])
          ).rows[0]!.id;
        }

        // historical payment evidence for the legacy amount_paid
        const paid = apRow != null ? dec(apRow.amount_paid) : amountPaid;
        if (invoiceId != null && paid > 0n) {
          const reusedPay = await findMappedId(client, 'accounts_payable_payment', poCode, 'supplier_payment', 'supplier_payment', opts.tenantId);
          if (reusedPay) {
            stats.supplierPaymentsReused += 1;
          } else {
            const payCode = `MSP-${poCode}`;
            const method = (apRow?.payment_method ?? 'cash').toLowerCase().includes('bank') ? 'bank_transfer' : 'cash';
            const payRes = await client.query<{ id: string }>(
              `INSERT INTO supplier_payment
                 (tenant_id, code, client_doc_id, supplier_id, business_date, amount, method, reference, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (tenant_id, code) DO NOTHING RETURNING id`,
              [
                opts.tenantId, payCode, `migration-${poCode}`, supplierId, businessDate,
                formatScaled(paid, 4), method, apRow?.payment_details ?? null,
                'imported from legacy accounts_payable.amount_paid (historical)',
              ],
            );
            let paymentId = payRes.rows[0]?.id;
            if (paymentId == null) {
              paymentId = (
                await client.query<{ id: string }>(`SELECT id FROM supplier_payment WHERE tenant_id = $1 AND code = $2`, [
                  opts.tenantId,
                  payCode,
                ])
              ).rows[0]!.id;
            } else {
              await writeLegacyMap(client, 'accounts_payable_payment', poCode, 'supplier_payment', paymentId, opts.runId);
              stats.legacyIdMapRowsPhase4 += 1;
              stats.supplierPaymentsImported += 1;
            }
            await client.query(
              `INSERT INTO supplier_payment_allocation (tenant_id, payment_id, supplier_invoice_id, amount)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (payment_id, supplier_invoice_id) DO NOTHING`,
              [opts.tenantId, paymentId, invoiceId, formatScaled(paid > invoiceTotal ? invoiceTotal : paid, 4)],
            );
          }
        }

      }
    }

    // ---- 4. legacy general journal: reference-only accounting -------------
    let journalDebit = 0n;
    let journalCredit = 0n;
    for (const j of rows.generalJournal) {
      journalDebit += dec(j.debit_amount);
      journalCredit += dec(j.credit_amount);
    }
    if (rows.generalJournal.length > 0) {
      records.push({
        legacy_table: 'general_journal',
        legacy_id: 'aggregate',
        field: 'debit_vs_credit_totals',
        legacy_stored_value: { debit: formatScaled(journalDebit, 4), credit: formatScaled(journalCredit, 4) },
        legacy_reconstructed_value: { debit: formatScaled(journalDebit, 4), credit: formatScaled(journalCredit, 4) },
        new_system_value: { referenceOnly: true },
        correction_delta: { imbalance: formatScaled(journalDebit - journalCredit, 4) },
        correction_reason: 'D8_D9_LEGACY_JOURNALS_REFERENCE_ONLY',
        evidence: {
          note: 'legacy journals are imported as reference evidence only; the new GL opens from the opening trial balance built from documents',
        },
        severity: 'info',
        requires_manual_approval: false,
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  // ---- 5. opening trial balance (its own transaction) ---------------------
  const tb = await buildOpeningTrialBalance(client, opts);
  stats.openingTbPosted = tb.posted;
  stats.equityPlug = tb.equityPlug;
  stats.openingTbDebit = tb.totalDebit;
  stats.openingTbCredit = tb.totalCredit;
  records.push(...tb.records);

  return { stats, records, warnings };
}

async function buildOpeningTrialBalance(
  client: PoolClient | Client,
  opts: Phase4Options,
): Promise<{
  posted: boolean;
  equityPlug: string;
  totalDebit: string;
  totalCredit: string;
  records: ReconciliationRecord[];
}> {
  const records: ReconciliationRecord[] = [];
  await client.query('BEGIN');
  try {
    // already posted for this TENANT? (rerun idempotency — one opening TB
    // per tenant, ever; a second run must not duplicate the opening)
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'migration_opening'`,
      [opts.tenantId],
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      // still compute the plug from the CURRENT canonical state so the
      // reconciliation evidence stays byte-identical across runs
      const state = await openingComponents(client, opts.tenantId);
      records.push(openingPlugRecord(state));
      return { posted: true, equityPlug: state.plug, totalDebit: '0.0000', totalCredit: '0.0000', records };
    }

    // resolve the control accounts — provisioning the neutral chart first
    // (the migration runs as admin SQL, so the service-level ensureDefaults
    // never ran; the seeds mirror FinancialConfigurationService.CONTROL_CHART)
    const CHART: Array<[string, string, string, string]> = [
      ['cash', '1000', 'Cash on Hand', 'asset'],
      ['bank_clearing', '1010', 'Bank Clearing', 'asset'],
      ['momo_clearing', '1020', 'Mobile Money Clearing', 'asset'],
      ['cheque_clearing', '1030', 'Cheques in Transit', 'asset'],
      ['accounts_receivable', '1100', 'Accounts Receivable', 'asset'],
      ['inventory', '1200', 'Inventory', 'asset'],
      ['supplier_advance', '1310', 'Advances to Suppliers', 'asset'],
      ['input_tax_recoverable', '1400', 'Input Tax Recoverable', 'asset'],
      ['customer_deposit_liability', '2100', 'Customer Deposits', 'liability'],
      ['tax_payable', '2200', 'Tax Payable', 'liability'],
      ['accounts_payable', '2300', 'Accounts Payable', 'liability'],
      ['grni_clearing', '2310', 'GR/IR Accrual', 'liability'],
      ['retained_earnings', '3900', 'Retained Earnings', 'equity'],
      ['opening_balance_equity', '3950', 'Opening Balance Equity', 'equity'],
      ['sales_revenue', '4000', 'Sales Revenue', 'revenue'],
      ['inventory_adjustment_gain', '4100', 'Inventory Adjustment Gains', 'other_income'],
      ['cogs', '5000', 'Cost of Goods Sold', 'cost_of_sales'],
      ['purchase_expense', '5100', 'Purchases & Direct Expenses', 'operating_expense'],
      ['purchase_price_variance', '5200', 'Purchase Price Variance', 'operating_expense'],
      ['inventory_adjustment_loss', '5300', 'Inventory Shrinkage & Write-offs', 'operating_expense'],
      ['bank_fee_expense', '5400', 'Bank Charges', 'operating_expense'],
    ];
    for (const [purpose, code, name, cls] of CHART) {
      await client.query(
        `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance, is_control)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (tenant_id, code) DO NOTHING`,
        [
          opts.tenantId, code, name,
          cls === 'cost_of_sales' || cls.endsWith('expense') ? 'expense'
            : cls === 'other_income' ? 'revenue' : cls, // broad type
          cls, // statement class
          cls === 'asset' || cls === 'cost_of_sales' || cls.endsWith('expense') ? 'debit' : 'credit',
        ],
      );
      await client.query(
        `INSERT INTO gl_mapping (tenant_id, purpose, account_id)
         SELECT $1, $2, a.id FROM gl_account a WHERE a.tenant_id = $1 AND a.code = $3
         ON CONFLICT (tenant_id, purpose) DO NOTHING`,
        [opts.tenantId, purpose, code],
      );
    }
    const accounts = await client.query<{ purpose: string; account_id: string }>(
      `SELECT purpose, account_id FROM gl_mapping WHERE tenant_id = $1`,
      [opts.tenantId],
    );
    const byPurpose = new Map(accounts.rows.map((r) => [r.purpose, r.account_id]));

    // canonical opening components (all from DOCUMENTS, never snapshots)
    const comps = await openingComponents(client, opts.tenantId);
    const stock = parseScaled(comps.stock, 4);
    const ar = parseScaled(comps.ar, 4);
    const ap = parseScaled(comps.ap, 4);
    const cash = parseScaled(comps.cash, 4);

    // journal legs: Dr stock, Dr AR, Dr cash / Cr AP, Cr equity (plug)
    const debit = stock + ar + cash;
    const credit = ap;
    const plug = debit - credit; // positive → credit equity (we are owed more than we owe)
    const legs: Array<{ account_id: string; debit: string; credit: string; memo: string }> = [];
    const arAccount = byPurpose.get('accounts_receivable');
    const apAccount = byPurpose.get('accounts_payable');
    const invAccount = byPurpose.get('inventory');
    const eqAccount = byPurpose.get('opening_balance_equity');
    if (stock !== 0n && invAccount) {
      legs.push({ account_id: invAccount, debit: formatScaled(stock, 4), credit: '0.0000', memo: 'opening stock value (migration)' });
    }
    if (ar !== 0n && arAccount) {
      legs.push({ account_id: arAccount, debit: formatScaled(ar, 4), credit: '0.0000', memo: 'opening receivables (migration)' });
    }
    if (cash !== 0n) {
      // split across the imported bank GL accounts and the cash control
      legs.push({ account_id: byPurpose.get('cash')!, debit: formatScaled(cash, 4), credit: '0.0000', memo: 'opening cash & bank (legacy balances, migration)' });
    }
    if (ap !== 0n && apAccount) {
      legs.push({ account_id: apAccount, debit: '0.0000', credit: formatScaled(ap, 4), memo: 'opening payables (migration)' });
    }
    if (plug !== 0n && eqAccount) {
      legs.push({
        account_id: eqAccount,
        debit: formatScaled(plug < 0n ? -plug : 0n, 4),
        credit: formatScaled(plug > 0n ? plug : 0n, 4),
        memo: 'opening-balance equity plug (explicit, requires accountant approval)',
      });
    }

    if (legs.length > 0) {
      const entry = await client.query<{ id: string }>(
        `INSERT INTO journal_entry
           (tenant_id, source_kind, source_id, event, description, business_date, total_debit, total_credit)
         VALUES ($1,'migration_opening',$2,'opening_tb','Opening trial balance (migration)',$3,$4,$5)
         ON CONFLICT (tenant_id, source_kind, source_id, event) DO NOTHING RETURNING id`,
        [opts.tenantId, opts.runId, '1970-01-01', formatScaled(debit, 4), formatScaled(debit, 4)],
      );
      const entryId = entry.rows[0]?.id;
      if (entryId != null) {
        for (const leg of legs) {
          await client.query(
            `INSERT INTO journal_line (tenant_id, entry_id, account_id, debit, credit, memo)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [opts.tenantId, entryId, leg.account_id, leg.debit, leg.credit, leg.memo],
          );
        }
        if (plug !== 0n) {
          records.push(openingPlugRecord(comps));
        }
      }
    }
    await client.query('COMMIT');
    return {
      posted: true,
      equityPlug: formatScaled(plug, 4),
      totalDebit: formatScaled(debit, 4),
      totalCredit: formatScaled(debit, 4),
      records,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/** The equity-plug reconciliation record (identical on first run and reruns). */
function openingPlugRecord(state: {
  stock: string;
  ar: string;
  ap: string;
  cash: string;
  plug: string;
}): ReconciliationRecord {
  const f = (v: string) => formatScaled(parseScaled(v, 4), 4);
  return {
    legacy_table: 'opening_trial_balance',
    legacy_id: 'opening-tb',
    field: 'equity_plug',
    legacy_stored_value: {},
    legacy_reconstructed_value: {
      stock: f(state.stock),
      receivables: f(state.ar),
      payables: f(state.ap),
      cashAndBank: f(state.cash),
    },
    new_system_value: { equityPlug: f(state.plug) },
    correction_delta: { plug: f(state.plug) },
    correction_reason: 'OPENING_TB_EQUITY_PLUG',
    evidence: {
      note: 'the opening trial balance is built from documents; any residual imbalance is this explicit, isolated, quantified plug — accountant sign-off required before go-live',
    },
    severity: 'warning',
    requires_manual_approval: true,
  };
}

/**
 * Canonical opening components (all from DOCUMENTS, never snapshots):
 *   stock value = Σ stock_cost_state.total_value (opening imports)
 *   AR opening  = Σ customer party_opening_balance + open imported sales invoices
 *   AP opening  = Σ supplier party_opening_balance + open supplier invoices
 *   cash/bank   = legacy accounts.current_balance (the only legacy source;
 *                 recorded with drift evidence, never trusted silently)
 */
async function openingComponents(
  client: PoolClient | Client,
  tenantId: string,
): Promise<{ stock: string; ar: string; ap: string; cash: string; debit: bigint; credit: bigint; plug: string }> {
  const stock = (
    await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(total_value), 0)::text AS total FROM stock_cost_state WHERE tenant_id = $1`,
      [tenantId],
    )
  ).rows[0]!.total;
  const ar = (
    await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         (SELECT COALESCE(SUM(amount), 0) FROM party_opening_balance
           WHERE tenant_id = $1 AND party_type = 'customer' AND status = 'posted')
         + COALESCE((SELECT SUM(i.total - i.amount_recompute) FROM (
              SELECT si.id, si.total, COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa
                  JOIN payment p ON p.id = pa.payment_id
                  WHERE pa.invoice_id = si.id), 0) AS amount_recompute
              FROM invoice si WHERE si.tenant_id = $1 AND si.status <> 'voided') i), 0)), 0
       )::text AS total`,
      [tenantId],
    )
  ).rows[0]!.total;
  const ap = (
    await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         (SELECT COALESCE(SUM(amount), 0) FROM party_opening_balance
           WHERE tenant_id = $1 AND party_type = 'supplier' AND status = 'posted')
         + COALESCE((SELECT SUM(si.total - si.paid_recompute) FROM (
              SELECT si.id, si.total, COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
                  JOIN supplier_payment sp ON sp.id = spa.payment_id
                  WHERE spa.supplier_invoice_id = si.id), 0) AS paid_recompute
              FROM supplier_invoice si WHERE si.tenant_id = $1 AND si.status <> 'cancelled') si), 0)), 0
       )::text AS total`,
      [tenantId],
    )
  ).rows[0]!.total;
  const cash = (
    await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(current_balance::numeric), 0)::text AS total FROM legacy_raw.accounts
       WHERE account_is_transferrable = '1'`,
    )
  ).rows[0]!.total;
  const debit = parseScaled(stock, 4) + parseScaled(ar, 4) + parseScaled(cash, 4);
  const credit = parseScaled(ap, 4);
  return { stock, ar, ap, cash, debit, credit, plug: formatScaled(debit - credit, 4) };
}
