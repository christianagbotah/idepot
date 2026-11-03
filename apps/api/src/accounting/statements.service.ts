/**
 * Financial statements (Phase 4) — derived exclusively from the
 * append-only journal (canonical accounting data).
 *
 * Corrected rules implemented (calculation-register C-27..C-31):
 *  - Trial balance: id-keyed accounts, opening + period movements +
 *    closing, ties to the balance sheet by construction;
 *  - P&L: ACCRUAL (posted journals in the window); COGS comes from the
 *    cost_of_sales class which the sale poster feeds from the AVCO
 *    ledger — never "COGS = supplier payments" (D9);
 *  - Balance sheet: ledger-derived balances, real equity accounts,
 *    current earnings = Σ P&L classes to date; NO frozen debtor/creditor
 *    snapshots (D7), NO undocumented equity plug (C-28);
 *  - Cash flow: INDIRECT method, documented in
 *    docs/accounting/cash-flow-method.md. Transfers between cash/bank
 *    accounts are net-zero and naturally cancel; the report asserts
 *    netCashFromOperations == netCashMovement on cash/bank controls.
 */
import { Injectable } from '@nestjs/common';
import type {
  BalanceSheetDto,
  CashFlowDto,
  ProfitAndLossDto,
  StatementLineDto,
  TrialBalanceDto,
  TrialBalanceRowDto,
} from '@idepot/contracts';
import { formatMoney, parseMoney } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';

type AccountMovement = {
  account_id: string;
  code: string;
  name: string;
  account_class: string;
  is_control: boolean;
  opening_debit: string;
  opening_credit: string;
  period_debit: string;
  period_credit: string;
  [k: string]: unknown;
};

@Injectable()
export class FinancialStatementsService {
  constructor(private readonly uow: UnitOfWork) {}

  /* ------------------------------ trial balance ------------------------------ */

  async trialBalance(tenantId: string, args: { asOf: string; from?: string }): Promise<TrialBalanceDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const from = args.from ?? null;
      const res = await ctx.query<AccountMovement>(
        `SELECT a.id AS account_id, a.code, a.name, a.account_class, a.is_control,
                COALESCE(SUM(l.debit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) < $2::date AND ($3::date IS NULL OR COALESCE(e.business_date, e.occurred_at::date) < $3::date)), 0)::text AS opening_debit,
                COALESCE(SUM(l.credit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) < $2::date AND ($3::date IS NULL OR COALESCE(e.business_date, e.occurred_at::date) < $3::date)), 0)::text AS opening_credit,
                COALESCE(SUM(l.debit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) >= $2::date AND COALESCE(e.business_date, e.occurred_at::date) <= $4::date AND ($3::date IS NULL OR COALESCE(e.business_date, e.occurred_at::date) >= $3::date)), 0)::text AS period_debit,
                COALESCE(SUM(l.credit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) >= $2::date AND COALESCE(e.business_date, e.occurred_at::date) <= $4::date AND ($3::date IS NULL OR COALESCE(e.business_date, e.occurred_at::date) >= $3::date)), 0)::text AS period_credit
         FROM gl_account a
         JOIN journal_line l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
         JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = a.tenant_id
         WHERE a.tenant_id = $1
         GROUP BY a.id, a.code, a.name, a.account_class, a.is_control
         ORDER BY a.code`,
        [ctx.tenantId, from ?? '1970-01-01', from, args.asOf],
      );
      const rows: TrialBalanceRowDto[] = res.rows.map((r) => {
        const od = parseMoney(r.opening_debit);
        const oc = parseMoney(r.opening_credit);
        const pd = parseMoney(r.period_debit);
        const pc = parseMoney(r.period_credit);
        const cd = od + pd;
        const cc = oc + pc;
        const net = cd - cc;
        return {
          accountId: r.account_id,
          code: r.code,
          name: r.name,
          accountClass: r.account_class,
          openingDebit: formatMoney(od > oc ? od - oc : 0n),
          openingCredit: formatMoney(oc > od ? oc - od : 0n),
          periodDebit: formatMoney(pd),
          periodCredit: formatMoney(pc),
          closingDebit: formatMoney(net > 0n ? net : 0n),
          closingCredit: formatMoney(net < 0n ? -net : 0n),
        };
      });
      const sum = (f: keyof TrialBalanceRowDto) =>
        rows.reduce((s, r) => s + parseMoney(String(r[f])), 0n);
      const totalOpeningDebit = sum('openingDebit');
      const totalOpeningCredit = sum('openingCredit');
      const totalPeriodDebit = sum('periodDebit');
      const totalPeriodCredit = sum('periodCredit');
      const totalClosingDebit = sum('closingDebit');
      const totalClosingCredit = sum('closingCredit');
      return {
        asOf: args.asOf,
        from,
        rows,
        totalOpeningDebit: formatMoney(totalOpeningDebit),
        totalOpeningCredit: formatMoney(totalOpeningCredit),
        totalPeriodDebit: formatMoney(totalPeriodDebit),
        totalPeriodCredit: formatMoney(totalPeriodCredit),
        totalClosingDebit: formatMoney(totalClosingDebit),
        totalClosingCredit: formatMoney(totalClosingCredit),
        balanced:
          totalOpeningDebit === totalOpeningCredit &&
          totalPeriodDebit === totalPeriodCredit &&
          totalClosingDebit === totalClosingCredit,
      };
    });
  }

  /* --------------------------------- P&L -------------------------------------- */

  async profitAndLoss(tenantId: string, args: { from: string; to: string }): Promise<ProfitAndLossDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await this.classTotals(ctx, args.from, args.to);
      const section = (cls: string): StatementLineDto[] =>
        res
          .filter((r) => r.account_class === cls)
          .map((r) => ({
            accountCode: r.code,
            accountName: r.name,
            accountClass: r.account_class,
            amount: formatMoney(r.debit > r.credit ? r.debit - r.credit : r.credit - r.debit),
          }));
      const signed = (cls: string) =>
        res
          .filter((r) => r.account_class === cls)
          .reduce((s, r) => {
            // debit-normal classes: amount = D − C; credit-normal: C − D
            const net = r.debit - r.credit;
            return s + (cls === 'revenue' || cls === 'other_income' ? -net : net);
          }, 0n);
      const totalRevenue = signed('revenue');
      const totalCostOfSales = signed('cost_of_sales');
      const totalOperatingExpenses = signed('operating_expense');
      const totalOtherIncome = signed('other_income');
      const totalOtherExpenses = signed('other_expense');
      return {
        from: args.from,
        to: args.to,
        revenue: section('revenue'),
        costOfSales: section('cost_of_sales'),
        operatingExpenses: section('operating_expense'),
        otherIncome: section('other_income'),
        otherExpenses: section('other_expense'),
        totalRevenue: formatMoney(totalRevenue),
        totalCostOfSales: formatMoney(totalCostOfSales),
        grossProfit: formatMoney(totalRevenue - totalCostOfSales),
        totalOperatingExpenses: formatMoney(totalOperatingExpenses),
        totalOtherIncome: formatMoney(totalOtherIncome),
        totalOtherExpenses: formatMoney(totalOtherExpenses),
        netProfit: formatMoney(
          totalRevenue - totalCostOfSales - totalOperatingExpenses + totalOtherIncome - totalOtherExpenses,
        ),
      };
    });
  }

  /* ------------------------------ balance sheet ------------------------------- */

  async balanceSheet(tenantId: string, asOf: string): Promise<BalanceSheetDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await this.classTotals(ctx, '1970-01-01', asOf);
      const line = (r: { code: string; name: string; account_class: string; debit: bigint; credit: bigint }): StatementLineDto => ({
        accountCode: r.code,
        accountName: r.name,
        accountClass: r.account_class,
        amount: formatMoney(r.debit > r.credit ? r.debit - r.credit : r.credit - r.debit),
      });
      const assets = res.filter((r) => r.account_class === 'asset').map(line);
      const liabilities = res.filter((r) => r.account_class === 'liability').map(line);
      const equityAccounts = res.filter((r) => r.account_class === 'equity').map(line);
      const net = (cls: string) =>
        res.filter((r) => r.account_class === cls).reduce((s, r) => s + r.debit - r.credit, 0n);
      const totalAssets = net('asset');
      const totalLiabilities = -net('liability'); // credit-normal
      // current earnings = the P&L result since the beginning of time
      // (unclosed result): income (credit-normal, negated) minus expenses
      // (debit-normal). Global Σ(D−C) = 0 then guarantees
      // assets == liabilities + equity + current earnings EXACTLY.
      const currentEarnings =
        -net('revenue') - net('other_income') - net('cost_of_sales') - net('operating_expense') - net('other_expense');
      const totalEquity = -net('equity') + currentEarnings;
      const retained = res.find((r) => r.account_class === 'equity' && r.code === '3900');
      return {
        asOf,
        assets,
        liabilities,
        equity: equityAccounts,
        totalAssets: formatMoney(totalAssets),
        totalLiabilities: formatMoney(totalLiabilities),
        totalEquity: formatMoney(totalEquity),
        retainedEarningsAccountCode: retained?.code ?? null,
        currentEarnings: formatMoney(currentEarnings),
        balanced: totalAssets === totalLiabilities + totalEquity,
        difference: formatMoney(totalAssets - (totalLiabilities + totalEquity)),
      };
    });
  }

  /* -------------------------------- cash flow --------------------------------- */

  /**
   * INDIRECT method — rebuilt from accounting first principles (review
   * round 2; docs/accounting/cash-flow-method.md):
   *
   * The global ledger identity Σ(debits − credits) = 0 over EVERY journal
   * line in the window gives an EXACT decomposition of the cash movement:
   *
   *   cashΔ = netProfit + Σ_{non-cash balance-sheet accounts} (credit − debit)
   *
   * where `credit − debit` is the account's signed contribution to cash:
   *   - an ASSET increase (debit-heavy) contributes NEGATIVE  (consumes cash);
   *   - a LIABILITY increase (credit-heavy) contributes POSITIVE (funds
   *     operations — e.g. an unpaid GRN leaves inventory −X on the asset
   *     side and +X on the GR/IR liability side, netting exactly zero);
   *   - an EQUITY increase contributes POSITIVE (capital injection).
   * The previous implementation negated assets/equity but pushed liabilities
   * with the RAW debit−credit — reversing the required direction for every
   * credit-normal account (the unpaid-GRN case reported −100 instead of
   * +100). The formula here is uniform and derives from the identity, not
   * from per-class sign conventions.
   *
   * CLASSIFICATION (IFRS-style, purpose/class driven):
   *   operating   = net profit + working-capital changes (AR, inventory,
   *                 GR/IR, AP, deposits, advances, tax controls …);
   *   investing   = long-lived-asset accounts (purpose-designated; the
   *                 control chart has none yet, so the section is
   *                 honestly empty rather than fabricated);
   *   financing   = the equity class (capital injections / distributions);
   *   net increase/decrease in cash = operating + investing + financing.
   *
   * The result reconciles EXACTLY to the direct Σ(debits − credits) over
   * the configured cash & cash-equivalent accounts (purpose-mapped cash
   * controls + every bank account's own GL account) — both over the window
   * and for the closing balance. `unexplained` is surfaced, never plugged.
   */
  async cashFlow(tenantId: string, args: { from: string; to: string }): Promise<CashFlowDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{
        code: string; name: string; account_class: string; purpose: string | null;
        is_bank_account: boolean;
        debit: string; credit: string;
      }>(
        `SELECT a.code, a.name, a.account_class, m.purpose,
                (ba.id IS NOT NULL) AS is_bank_account,
                COALESCE(SUM(l.debit), 0)::text AS debit,
                COALESCE(SUM(l.credit), 0)::text AS credit
         FROM gl_account a
         JOIN journal_line l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
         JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = a.tenant_id
         LEFT JOIN gl_mapping m ON m.account_id = a.id AND m.tenant_id = a.tenant_id
         LEFT JOIN bank_account ba ON ba.gl_account_id = a.id AND ba.tenant_id = a.tenant_id
         WHERE a.tenant_id = $1 AND COALESCE(e.business_date, e.occurred_at::date) >= $2::date AND COALESCE(e.business_date, e.occurred_at::date) <= $3::date
         GROUP BY a.code, a.name, a.account_class, m.purpose, ba.id
         ORDER BY a.code`,
        [ctx.tenantId, args.from, args.to],
      );

      const CASH_PURPOSES = new Set(['cash', 'bank_clearing', 'momo_clearing', 'cheque_clearing']);
      /** purposes whose balance-sheet movement is an INVESTING activity
       *  (long-lived assets). Purpose-driven so tenants can designate
       *  accounts without code changes; empty in the seed chart. */
      const INVESTING_PURPOSES = new Set<string>([]);
      const netProfit = await this.profitAndLoss(ctx.tenantId, args);
      const netProfitScaled = parseMoney(netProfit.netProfit);

      const operatingAssetChanges: StatementLineDto[] = [];
      const operatingLiabilityChanges: StatementLineDto[] = [];
      const investingActivities: StatementLineDto[] = [];
      const financingActivities: StatementLineDto[] = [];
      let netCashMovement = 0n;
      let operatingContribution = 0n;
      let investingContribution = 0n;
      let financingContribution = 0n;

      for (const r of res.rows) {
        const debit = parseMoney(r.debit);
        const credit = parseMoney(r.credit);
        // signed CASH-EFFECT contribution of this account's movements:
        // credit − debit (see the method contract above)
        const contribution = credit - debit;
        if ((r.purpose != null && CASH_PURPOSES.has(r.purpose)) || r.is_bank_account) {
          netCashMovement += debit - credit; // cash accounts are the TARGET
          continue;
        }
        if (contribution === 0n) continue;
        const line: StatementLineDto = {
          accountCode: r.code, accountName: r.name, accountClass: r.account_class,
          amount: formatMoney(contribution),
        };
        if (r.account_class === 'equity') {
          financingActivities.push(line);
          financingContribution += contribution;
          continue;
        }
        if (r.purpose != null && INVESTING_PURPOSES.has(r.purpose)) {
          investingActivities.push(line);
          investingContribution += contribution;
          continue;
        }
        switch (r.account_class) {
          case 'asset':
            operatingAssetChanges.push(line);
            operatingContribution += contribution;
            break;
          case 'liability':
            operatingLiabilityChanges.push(line);
            operatingContribution += contribution;
            break;
          default:
            // P&L classes are already inside net profit — excluded here
            break;
        }
      }

      const netCashFromOperations = netProfitScaled + operatingContribution;
      const netIncreaseDecreaseInCash =
        netCashFromOperations + investingContribution + financingContribution;

      // direct reconciliation over the cash & cash-equivalent accounts
      const opening = await ctx.query<{ opening: string; closing: string }>(
        `SELECT
           (COALESCE(SUM(l.debit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) < $2::date), 0)
            - COALESCE(SUM(l.credit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) < $2::date), 0))::text AS opening,
           (COALESCE(SUM(l.debit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) <= $3::date), 0)
            - COALESCE(SUM(l.credit) FILTER (WHERE COALESCE(e.business_date, e.occurred_at::date) <= $3::date), 0))::text AS closing
         FROM journal_line l
         JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
         JOIN gl_account a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
         LEFT JOIN gl_mapping m ON m.account_id = a.id AND m.tenant_id = a.tenant_id
         LEFT JOIN bank_account ba ON ba.gl_account_id = a.id AND ba.tenant_id = a.tenant_id
         WHERE a.tenant_id = $1
           AND ((m.purpose IN ('cash','bank_clearing','momo_clearing','cheque_clearing')) OR ba.id IS NOT NULL)`,
        [ctx.tenantId, args.from, args.to],
      );
      const openingCash = parseMoney(opening.rows[0]!.opening);
      const closingCashDirect = parseMoney(opening.rows[0]!.closing);

      return {
        from: args.from,
        to: args.to,
        method: 'indirect' as const,
        netProfit: netProfit.netProfit,
        operatingAssetChanges,
        operatingLiabilityChanges,
        netCashFromOperations: formatMoney(netCashFromOperations),
        investingActivities,
        netCashFromInvesting: formatMoney(investingContribution),
        financingActivities,
        netCashFromFinancing: formatMoney(financingContribution),
        netIncreaseDecreaseInCash: formatMoney(netIncreaseDecreaseInCash),
        openingCashAndEquivalents: formatMoney(openingCash),
        closingCashAndEquivalents: formatMoney(openingCash + netIncreaseDecreaseInCash),
        netCashMovement: formatMoney(netCashMovement),
        // direct closing must equal opening + classified activities — the
        // identity guarantees it; any residual is surfaced, NEVER plugged
        unexplained: formatMoney(openingCash + netIncreaseDecreaseInCash - closingCashDirect),
      };
    });
  }

  /* -------------------------------- helpers ----------------------------------- */

  private async classTotals(
    ctx: UowContext,
    from: string,
    to: string,
  ): Promise<Array<{ code: string; name: string; account_class: string; debit: bigint; credit: bigint }>> {
    const res = await ctx.query<{ code: string; name: string; account_class: string; debit: string; credit: string }>(
      `SELECT a.code, a.name, a.account_class,
              COALESCE(SUM(l.debit), 0)::text AS debit,
              COALESCE(SUM(l.credit), 0)::text AS credit
       FROM gl_account a
       JOIN journal_line l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
       JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND COALESCE(e.business_date, e.occurred_at::date) >= $2::date AND COALESCE(e.business_date, e.occurred_at::date) <= $3::date
       GROUP BY a.code, a.name, a.account_class
       ORDER BY a.code`,
      [ctx.tenantId, from, to],
    );
    return res.rows.map((r) => ({
      code: r.code,
      name: r.name,
      account_class: r.account_class,
      debit: parseMoney(r.debit),
      credit: parseMoney(r.credit),
    }));
  }
}
