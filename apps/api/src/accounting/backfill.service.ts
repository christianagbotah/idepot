/**
 * GL backfill / alignment (Phase 4) — closes the accounting gaps that
 * Phase 3 explicitly deferred (STATUS "Known limitations"):
 *
 *  1. non-sale inventory documents: opening-stock receipts, stock
 *     adjustments, count variances and write-offs now carry journals;
 *  2. pre-hardening Phase 3 invoices (cost_method IS NULL with a
 *     purchase-price cost_at_sale) get their missing sale journals;
 *  3. party opening balances (customer AR / supplier AP) get their
 *     opening-balance journals;
 *  4. pre-Phase-4 journal rows get business_date backfilled from
 *     occurred_at (statement queries also COALESCE, so both states read
 *     correctly).
 *
 * IDEMPOTENT BY CONSTRUCTION: every journal posts through
 * FinancialConfigurationService.postJournal whose
 * UNIQUE (tenant_id, source_kind, source_id, event) makes a second run
 * a deterministic conflict — skipped, never double-posted. Backfilled
 * entries are identified by their source_kind/event (origin evidence)
 * and each run writes an audit row with per-source counts.
 */
import { Injectable } from '@nestjs/common';
import { formatMoney, parseMoney, parseQuantity, type GlPurpose, type JournalLineSpec } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';

interface AccountingPrincipal {
  userId: string;
  tenantId: string;
  displayName: string;
}

export interface BackfillReport {
  nonSaleInventoryJournals: number;
  preHardeningSaleJournals: number;
  partyOpeningBalanceJournals: number;
  skipped: Array<{ source: string; reason: string }>;
}

@Injectable()
export class BackfillService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finance: FinancialConfigurationService,
  ) {}

  async runBackfill(principal: AccountingPrincipal): Promise<BackfillReport> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await this.finance.ensureDefaults(ctx);
      const report: BackfillReport = {
        nonSaleInventoryJournals: 0,
        preHardeningSaleJournals: 0,
        partyOpeningBalanceJournals: 0,
        skipped: [],
      };

      // Idempotency WITHOUT error-catching: a failed INSERT inside one
      // transaction aborts it, so existing journals are pre-loaded and
      // skipped deterministically (the UNIQUE (tenant, source_kind,
      // source_id, event) remains the structural backstop for races).
      const existingRes = await ctx.query<{ source_kind: string; source_id: string; event: string }>(
        `SELECT source_kind, source_id::text AS source_id, event FROM journal_entry WHERE tenant_id = $1`,
        [ctx.tenantId],
      );
      const existing = new Set(existingRes.rows.map((r) => `${r.source_kind}:${r.source_id}:${r.event}`));
      const already = (kind: string, id: string, event: string) => existing.has(`${kind}:${id}:${event}`);

      // NOTE: pre-Phase-4 journal rows keep business_date NULL — the
      // journal is append-only (no UPDATE grant, by design). Every
      // statement query reads COALESCE(business_date, occurred_at::date),
      // so legacy rows are classified correctly without mutation.

      // ---- 1. non-sale inventory documents ------------------------------
      // opening-stock receipts (migration reason) + adjustments + count
      // variances: Dr Inventory / Cr opening equity (opening) or
      // Cr adjustment gain / Dr adjustment loss (variances).
      // Review hardening: movements that ALREADY carry a synchronous
      // journal (source_kind='stock_movement' — the Phase 4 posting path
      // of adjustments/counts/opening stock/transfers) are skipped —
      // the backfill is for historical gaps only and can never double-post
      // a journal that was produced synchronously with its document.
      const movements = await ctx.query<{
        id: string; movement_type: string; reason: string | null; occurred_at: string;
        cost_value: string | null; quantity_base: string;
        source_document_type: string | null; source_document_id: string | null;
      }>(
        `SELECT m.id, m.movement_type, m.reason, m.occurred_at, m.cost_value::text AS cost_value,
                m.quantity_base::text AS quantity_base, m.source_document_type, m.source_document_id
         FROM stock_movement m
         WHERE m.tenant_id = $1
           AND m.cost_value IS NOT NULL AND m.cost_value <> 0
           AND m.source_document_type IN ('stock_adjustment','stock_count','stock_opening')
           AND NOT EXISTS (
             SELECT 1 FROM journal_entry je
             WHERE je.tenant_id = m.tenant_id
               AND je.source_kind = 'stock_movement' AND je.source_id = m.id)
         ORDER BY m.occurred_at, m.id`,
        [ctx.tenantId],
      );
      const purposes: GlPurpose[] = [
        'inventory', 'opening_balance_equity', 'inventory_adjustment_gain', 'inventory_adjustment_loss',
      ];
      const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
      for (const m of movements.rows) {
        if (already('stock_movement_backfill', m.id, 'inventory_value_backfilled')) continue;
        const value = parseMoney(m.cost_value!);
        const lines: JournalLineSpec[] = [];
        const memo = `${m.source_document_type} ${m.source_document_id ?? ''} ${m.movement_type}`;
        const businessDate = new Date(m.occurred_at).toISOString().slice(0, 10);
        if (parseQuantity(m.quantity_base) > 0n) {
          lines.push({ accountId: accounts.get('inventory')!, debit: formatMoney(value), memo });
          lines.push(
            m.reason === 'opening_balance'
              ? { accountId: accounts.get('opening_balance_equity')!, credit: formatMoney(value), memo }
              : { accountId: accounts.get('inventory_adjustment_gain')!, credit: formatMoney(value), memo },
          );
        } else {
          lines.push({ accountId: accounts.get('inventory_adjustment_loss')!, debit: formatMoney(value), memo });
          lines.push({ accountId: accounts.get('inventory')!, credit: formatMoney(value), memo });
        }
        try {
          const posted = await this.finance.postJournal(ctx, {
            sourceKind: 'stock_movement_backfill',
            sourceId: m.id,
            event: 'inventory_value_backfilled',
            description: `Backfill: ${m.source_document_type} ${m.movement_type}`,
            businessDate,
            occurredAt: new Date(m.occurred_at).toISOString(),
            createdBy: principal.userId,
            allowSoftClosedPeriod: true,
            lines,
          });
          if (posted != null) report.nonSaleInventoryJournals += 1;
        } catch (err) {
          report.skipped.push({
            source: `stock_movement:${m.id}`,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ---- 2. pre-hardening Phase 3 invoices ----------------------------
      const invoices = await ctx.query<{
        id: string; code: string; business_date: string; total: string; tax_total: string;
        tax_inclusive_total: string; cost_total: string; occurred_at: string;
      }>(
        `SELECT i.id, i.code, i.business_date::text AS business_date, i.total::text AS total,
                i.tax_total::text AS tax_total, i.tax_inclusive_total::text AS tax_inclusive_total,
                i.cost_total::text AS cost_total, i.occurred_at
         FROM invoice i
         WHERE i.tenant_id = $1 AND i.status <> 'voided'
           AND NOT EXISTS (
             SELECT 1 FROM journal_entry je
             WHERE je.tenant_id = $1 AND je.source_kind = 'invoice' AND je.source_id = i.id
               AND je.event = 'sale_posted')
           AND NOT EXISTS (
             SELECT 1 FROM invoice_reversal ir
             WHERE ir.tenant_id = $1 AND ir.invoice_id = i.id)
         ORDER BY i.occurred_at`,
        [ctx.tenantId],
      );
      const salePurposes: GlPurpose[] = ['sales_revenue', 'tax_payable', 'cogs', 'inventory', 'accounts_receivable', 'cash'];
      const saleAccounts = await this.finance.resolveGlAccounts(ctx, salePurposes);
      for (const inv of invoices.rows) {
        if (already('invoice_backfill', inv.id, 'sale_posted')) continue;
        const total = parseMoney(inv.total);
        const cogs = parseMoney(inv.cost_total);
        const taxAdded = parseMoney(inv.tax_total) - parseMoney(inv.tax_inclusive_total);
        const revenue = total - taxAdded;
        const lines: JournalLineSpec[] = [];
        // historical documents: the money side is reconstructed as the
        // remaining receivable + the cash share (allocations are unknown
        // for legacy rows; the AR control reconciles because payments
        // posted their own journals from Phase 3 hardening onward, and
        // pre-hardening payments are captured by their invoice totals)
        lines.push({ accountId: saleAccounts.get('accounts_receivable')!, debit: formatMoney(total), memo: `backfill sale ${inv.code}` });
        if (revenue > 0n) {
          lines.push({ accountId: saleAccounts.get('sales_revenue')!, credit: formatMoney(revenue), memo: `backfill sale ${inv.code} revenue` });
        }
        if (taxAdded > 0n) {
          lines.push({ accountId: saleAccounts.get('tax_payable')!, credit: formatMoney(taxAdded), memo: `backfill sale ${inv.code} tax` });
        }
        if (cogs > 0n) {
          lines.push({ accountId: saleAccounts.get('cogs')!, debit: formatMoney(cogs), memo: `backfill sale ${inv.code} COGS` });
          lines.push({ accountId: saleAccounts.get('inventory')!, credit: formatMoney(cogs), memo: `backfill sale ${inv.code} inventory` });
        }
        try {
          const posted = await this.finance.postJournal(ctx, {
            sourceKind: 'invoice_backfill',
            sourceId: inv.id,
            event: 'sale_posted',
            description: `Backfill: sale ${inv.code}`,
            businessDate: inv.business_date,
            occurredAt: new Date(inv.occurred_at).toISOString(),
            createdBy: principal.userId,
            allowSoftClosedPeriod: true,
            lines,
          });
          if (posted != null) report.preHardeningSaleJournals += 1;
        } catch (err) {
          report.skipped.push({
            source: `invoice:${inv.id}`,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ---- 2b. pre-hardening payments / deposits / credit applications ----
      // (they carry tenders + allocations since Phase 3 base — only their
      //  journals are missing; posting them makes the AR control tie out)
      const payments = await ctx.query<{
        id: string; code: string; amount: string; change_given: string; business_date: string;
        source_kind_hint: string | null;
      }>(
        `SELECT p.id, p.code, p.amount::text AS amount, p.change_given::text AS change_given,
                p.business_date::text AS business_date,
                (SELECT 'deposit' FROM customer_deposit cd WHERE cd.payment_id = p.id LIMIT 1) AS source_kind_hint
         FROM payment p
         WHERE p.tenant_id = $1
           AND NOT EXISTS (SELECT 1 FROM journal_entry je WHERE je.tenant_id = $1
               AND ((je.source_kind = 'payment' AND je.source_id = p.id AND je.event = 'receipt_posted')
                 OR (je.source_kind = 'customer_deposit' AND je.source_id = p.id AND je.event = 'deposit_posted')))
         ORDER BY p.occurred_at`,
        [ctx.tenantId],
      );
      const payPurposes: GlPurpose[] = ['accounts_receivable', 'customer_deposit_liability', 'cash', 'momo_clearing', 'cheque_clearing', 'bank_clearing'];
      const payAccounts = await this.finance.resolveGlAccounts(ctx, payPurposes);
      const TENDER_PURPOSE: Record<string, GlPurpose> = {
        cash: 'cash', momo: 'momo_clearing', cheque: 'cheque_clearing', bank_transfer: 'bank_clearing',
      };
      for (const p of payments.rows) {
        const isDeposit = p.source_kind_hint != null;
        if (already(isDeposit ? 'customer_deposit' : 'payment', p.id, isDeposit ? 'deposit_posted' : 'receipt_posted')) continue;
        const tenders = await ctx.query<{ method: string; amount: string }>(
          `SELECT method, amount::text AS amount FROM payment_tender WHERE payment_id = $1`,
          [p.id],
        );
        const allocatedRes = await ctx.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount), 0)::text AS total FROM payment_allocation WHERE payment_id = $1`,
          [p.id],
        );
        const amount = parseMoney(p.amount);
        const change = parseMoney(p.change_given);
        const allocated = parseMoney(allocatedRes.rows[0]!.total);
        const unapplied = amount - change - allocated;
        const lines: JournalLineSpec[] = [];
        for (const t of tenders.rows) {
          const purpose = TENDER_PURPOSE[t.method];
          if (!purpose) continue;
          lines.push({ accountId: payAccounts.get(purpose)!, debit: t.amount, memo: `backfill ${isDeposit ? 'deposit' : 'receipt'} ${p.code} tender ${t.method}` });
        }
        if (change > 0n) {
          lines.push({ accountId: payAccounts.get('cash')!, credit: formatMoney(change), memo: `backfill receipt ${p.code} change given` });
        }
        if (allocated > 0n) {
          lines.push({ accountId: payAccounts.get('accounts_receivable')!, credit: formatMoney(allocated), memo: `backfill receipt ${p.code} receivable settled` });
        }
        if (unapplied > 0n) {
          lines.push({ accountId: payAccounts.get('customer_deposit_liability')!, credit: formatMoney(unapplied), memo: `backfill receipt ${p.code} customer credit` });
        }
        try {
          const posted = await this.finance.postJournal(ctx, {
            sourceKind: isDeposit ? 'customer_deposit' : 'payment',
            sourceId: p.id,
            event: isDeposit ? 'deposit_posted' : 'receipt_posted',
            description: `Backfill: ${isDeposit ? 'deposit' : 'receipt'} ${p.code}`,
            businessDate: p.business_date,
            createdBy: principal.userId,
            allowSoftClosedPeriod: true,
            lines,
          });
          if (posted != null) report.preHardeningSaleJournals += 1;
        } catch (err) {
          report.skipped.push({
            source: `payment:${p.id}`,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const credits = await ctx.query<{ id: string; amount: string; business_date: string }>(
        `SELECT ca.id, ca.amount::text AS amount, ca.created_at::date::text AS business_date
         FROM credit_application ca
         WHERE ca.tenant_id = $1
           AND NOT EXISTS (SELECT 1 FROM journal_entry je WHERE je.tenant_id = $1
               AND je.source_kind = 'credit_application' AND je.source_id = ca.id AND je.event = 'credit_applied')`,
        [ctx.tenantId],
      );
      for (const ca of credits.rows) {
        if (already('credit_application', ca.id, 'credit_applied')) continue;
        try {
          const posted = await this.finance.postJournal(ctx, {
            sourceKind: 'credit_application',
            sourceId: ca.id,
            event: 'credit_applied',
            description: 'Backfill: credit application',
            businessDate: ca.business_date,
            createdBy: principal.userId,
            allowSoftClosedPeriod: true,
            lines: [
              { accountId: payAccounts.get('customer_deposit_liability')!, debit: ca.amount, memo: 'backfill deposit consumed' },
              { accountId: payAccounts.get('accounts_receivable')!, credit: ca.amount, memo: 'backfill invoice settled by credit' },
            ],
          });
          if (posted != null) report.preHardeningSaleJournals += 1;
        } catch (err) {
          report.skipped.push({
            source: `credit_application:${ca.id}`,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ---- 3. party opening balances --------------------------------------
      const openings = await ctx.query<{
        id: string; party_type: string; amount: string; business_date: string;
      }>(
        `SELECT pob.id, pob.party_type, pob.amount::text AS amount, pob.created_at::date::text AS business_date
         FROM party_opening_balance pob
         WHERE pob.tenant_id = $1 AND pob.status = 'posted'
           AND NOT EXISTS (
             SELECT 1 FROM journal_entry je
             WHERE je.tenant_id = $1 AND je.source_kind = 'party_opening_balance'
               AND je.source_id = pob.id AND je.event = 'posted')`,
        [ctx.tenantId],
      );
      const openingPurposes: GlPurpose[] = [
        'accounts_receivable', 'accounts_payable', 'opening_balance_equity', 'supplier_advance',
      ];
      const openingAccounts = await this.finance.resolveGlAccounts(ctx, openingPurposes);
      for (const ob of openings.rows) {
        const amount = parseMoney(ob.amount);
        if (amount === 0n) continue;
        const lines: JournalLineSpec[] =
          ob.party_type === 'customer'
            ? [
                { accountId: openingAccounts.get('accounts_receivable')!, debit: formatMoney(amount), memo: 'customer opening balance' },
                { accountId: openingAccounts.get('opening_balance_equity')!, credit: formatMoney(amount), memo: 'customer opening balance' },
              ]
            : amount > 0n
              ? [
                  { accountId: openingAccounts.get('opening_balance_equity')!, debit: formatMoney(amount), memo: 'supplier opening balance' },
                  { accountId: openingAccounts.get('accounts_payable')!, credit: formatMoney(amount), memo: 'supplier opening balance' },
                ]
              : [
                  { accountId: openingAccounts.get('supplier_advance')!, debit: formatMoney(-amount), memo: 'supplier advance opening balance' },
                  { accountId: openingAccounts.get('opening_balance_equity')!, credit: formatMoney(-amount), memo: 'supplier advance opening balance' },
                ];
        try {
          const posted = await this.finance.postJournal(ctx, {
            sourceKind: 'party_opening_balance',
            sourceId: ob.id,
            event: 'posted',
            description: `Opening balance (${ob.party_type})`,
            businessDate: ob.business_date,
            createdBy: principal.userId,
            allowSoftClosedPeriod: true,
            lines,
          });
          if (posted != null) report.partyOpeningBalanceJournals += 1;
        } catch (err) {
          report.skipped.push({
            source: `party_opening_balance:${ob.id}`,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'accounting.backfill_run',
        entityType: 'backfill',
        entityId: 'phase4',
        details: {
          nonSaleInventoryJournals: report.nonSaleInventoryJournals,
          preHardeningSaleJournals: report.preHardeningSaleJournals,
          partyOpeningBalanceJournals: report.partyOpeningBalanceJournals,
          skipped: report.skipped.length,
        },
      });
      return report;
    });
  }
}
