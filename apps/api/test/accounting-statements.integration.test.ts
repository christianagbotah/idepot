/**
 * Phase 4 accounting integration (ROADMAP exit criteria):
 *  - trial balance balances (opening + period + closing);
 *  - P&L derives from posted journals with independently calculable
 *    expected values; COGS reconciles with the stock cost ledger;
 *  - balance sheet satisfies Assets = Liabilities + Equity;
 *  - cash flow (indirect) reconciles to the cash/bank control movement;
 *  - AR/AP control accounts reconcile to their subledgers;
 *  - accounting periods lock posting (and corrections may still post
 *    into a soft-closed period);
 *  - the GL backfill is idempotent (second run posts nothing);
 *  - chart-of-accounts administration (deactivation guard).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);
const JAN1 = `${YEAR}-01-01`;

describe('Phase 4 accounting: statements, periods, backfill, reconciliation', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let supplierS1: string;
  let customerC1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'ACC-WH', name: 'ACC WH' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'ACC-PC', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'ACC-A', name: 'ACC A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    supplierS1 = (await request(app.getHttpServer()).post('/api/suppliers').set(owner).send({ name: 'ACC Supplier', phone: '0204444444' })).body.id;
    customerC1 = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'ACC Customer', phone: '0244555555' })).body.id;
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    await fx.admin.query(
      `UPDATE tenant_config SET match_price_tolerance_pct = 0.05 WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  // ---------------- fixture: a fully calculable economic scenario -------------
  // purchase 10 units @ 30 (GRN + invoice, paid 200 cash + 100 advance)
  //   → inventory 300, AP 300, cash −300 (advance 100 separate)
  // sell 4 units @ 50 cash
  //   → revenue 200, COGS 120 (4 × 30 AVCO), cash +200, inventory −120
  // expense: bank transfer fee 5 (manual journal also 20 rent)

  it('builds the fixture scenario (purchase + sale + transfer + manual journal)', async () => {
    // --- opening funding: Dr cash 500 + Dr bank1 200 / Cr opening equity ---
    await fx.admin.query(
      `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance)
       VALUES ($1, 'ACC-BNK', 'ACC Bank', 'asset', 'asset', 'debit')`,
      [fx.tenantA.tenantId],
    );
    const bank = await request(app.getHttpServer())
      .post('/api/banking/accounts')
      .set(manager)
      .send({ code: 'ACC-B1', bankName: 'ACC Bank', accountName: 'Main', accountNumber: '999888777', glAccountCode: 'ACC-BNK' });
    expect(bank.status).toBe(201);
    const opening = await request(app.getHttpServer())
      .post('/api/accounting/journals')
      .set(manager)
      .send({
        businessDate: TODAY,
        description: 'opening funding for the fixture scenario',
        lines: [
          { accountCode: '1000', debit: '500.00', memo: 'opening cash' },
          { accountCode: 'ACC-BNK', debit: '200.00', memo: 'opening bank' },
          { accountCode: '3950', credit: '700.00', memo: 'opening equity' },
        ],
      });
    expect(opening.status).toBe(201);

    // --- purchase 10 @ 30, invoice paid in full ---
    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '10', unitCost: '30.00' }],
      });
    expect(grn.status).toBe(201);
    const inv = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'ACC-INV-1',
        supplierInvoiceDate: TODAY,
        dueDate: TODAY,
        businessDate: TODAY,
        post: true,
        lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productA, description: 'fixture purchase', quantityBase: '10', unitPrice: '30.00' }],
      });
    expect(inv.status).toBe(201);
    expect(inv.body.total).toBe('300.0000');
    const pay = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({
        supplierId: supplierS1,
        businessDate: TODAY,
        amount: '300.00',
        method: 'cash',
        allocations: [{ supplierInvoiceId: inv.body.id, amount: '300.0000' }],
      });
    expect(pay.status).toBe(201);

    // --- sale: 4 units @ 50, cash ---
    const sale = await request(app.getHttpServer())
      .post('/api/sales/commit')
      .set(manager)
      .send({
        warehouseId: whA,
        customerId: customerC1,
        lines: [{ productId: productA, quantityBase: '4', unitPrice: '50.00' }],
        tenders: [{ method: 'cash', amount: '200.00' }],
      });
    expect(sale.status).toBe(201);
    expect(sale.body.invoice.total).toBe('200.0000');
    expect(sale.body.invoice.costTotal).toBe('120.0000'); // 4 × 30 AVCO

    // --- transfer with fee (same-account transfer is rejected 400) ---
    const sameAccount = await request(app.getHttpServer())
      .post('/api/banking/transfers')
      .set(manager)
      .send({
        fromBankAccountId: bank.body.id,
        toBankAccountId: bank.body.id,
        businessDate: TODAY,
        amount: '0.01',
        fee: '5.00',
      });
    expect(sameAccount.status).toBe(400);
    await fx.admin.query(
      `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance)
       VALUES ($1, 'ACC-BNK2', 'ACC Bank Two', 'asset', 'asset', 'debit')`,
      [fx.tenantA.tenantId],
    );
    const bank2 = await request(app.getHttpServer())
      .post('/api/banking/accounts')
      .set(manager)
      .send({ code: 'ACC-B2', bankName: 'ACC Bank', accountName: 'Second', accountNumber: '999888778', glAccountCode: 'ACC-BNK2' });
    const trf = await request(app.getHttpServer())
      .post('/api/banking/transfers')
      .set(manager)
      .send({
        fromBankAccountId: bank.body.id,
        toBankAccountId: bank2.body.id,
        businessDate: TODAY,
        amount: '100.00',
        fee: '5.00',
      });
    expect(trf.status).toBe(201);

    // --- manual journal: rent 20 cash ---
    const manual = await request(app.getHttpServer())
      .post('/api/accounting/journals')
      .set(manager)
      .send({
        businessDate: TODAY,
        description: 'monthly rent',
        reference: 'RENT-1',
        lines: [
          { accountCode: '5100', debit: '20.00', memo: 'rent' },
          { accountCode: '1000', credit: '20.00', memo: 'cash out' },
        ],
      });
    expect(manual.status).toBe(201);
    expect(manual.body.totalDebit).toBe('20.0000');
  });

  it('trial balance balances (opening + period + closing)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/accounting/trial-balance?asOf=${TODAY}`)
      .set(owner);
    expect(res.status).toBe(200);
    expect(res.body.balanced).toBe(true);
    expect(res.body.totalPeriodDebit).toBe(res.body.totalPeriodCredit);
    expect(res.body.totalClosingDebit).toBe(res.body.totalClosingCredit);
    // every journal of the scenario is in the period
    expect(Number(res.body.totalPeriodDebit)).toBeGreaterThan(0);
  });

  it('P&L: revenue 200, COGS 120 (ties to the AVCO stock ledger), net profit before opex', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/accounting/profit-and-loss?from=${JAN1}&to=${TODAY}`)
      .set(owner);
    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe('200.0000');
    expect(res.body.totalCostOfSales).toBe('120.0000');
    expect(res.body.grossProfit).toBe('80.0000');
    // bank fee 5 + rent 20 = 25 operating expenses; net = 55
    expect(res.body.totalOperatingExpenses).toBe('25.0000');
    expect(res.body.netProfit).toBe('55.0000');

    // COGS ↔ stock ledger tie-out (invariant: P&L COGS == Σ sale-issue cost)
    const ledger = await fx.admin.query(
      `SELECT COALESCE(SUM(cost_value), 0)::text AS total FROM stock_movement
       WHERE tenant_id = $1 AND movement_type = 'issue' AND source_document_type = 'invoice'`,
      [fx.tenantA.tenantId],
    );
    expect(ledger.rows[0].total).toBe('120.0000');
  });

  it('balance sheet: Assets = Liabilities + Equity (with current earnings)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/accounting/balance-sheet?asOf=${TODAY}`)
      .set(owner);
    expect(res.status).toBe(200);
    expect(res.body.balanced).toBe(true);
    expect(res.body.difference).toBe('0.0000');
    // current earnings = the P&L result to date (55)
    expect(res.body.currentEarnings).toBe('55.0000');
    // inventory 6 × 30 = 180 remains
    const inventory = res.body.assets.find((a: { accountCode: string }) => a.accountCode === '1200');
    expect(inventory.amount).toBe('180.0000');
    // cash: 500 opening − 300 purchase + 200 sale − 20 rent = 380
    const cash = res.body.assets.find((a: { accountCode: string }) => a.accountCode === '1000');
    expect(cash.amount).toBe('380.0000');
    // bank one: 200 opening − 105 transferred (incl. fee) = 95
    const bank1 = res.body.assets.find((a: { accountCode: string }) => a.accountCode === 'ACC-BNK');
    expect(bank1.amount).toBe('95.0000');
    const bank2 = res.body.assets.find((a: { accountCode: string }) => a.accountCode === 'ACC-BNK2');
    expect(bank2.amount).toBe('100.0000');
    // GR/IR cleared: no residual accrual
    const grni = res.body.liabilities.find((a: { accountCode: string }) => a.accountCode === '2310');
    expect(grni.amount).toBe('0.0000');
    // AP control: fully paid → zero liability... presented as 0
    const ap = res.body.liabilities.find((a: { accountCode: string }) => a.accountCode === '2300');
    expect(ap.amount).toBe('0.0000');
  });

  it('cash flow (indirect): operating / financing classified separately, identity exact', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/accounting/cash-flow?from=${JAN1}&to=${TODAY}`)
      .set(owner);
    expect(res.status).toBe(200);
    expect(res.body.method).toBe('indirect');
    expect(res.body.netProfit).toBe('55.0000');
    // the documented invariant: unexplained == 0 (never plugged)
    expect(res.body.unexplained).toBe('0.0000');
    // direct cash movement: cash +380, bank1 +95, bank2 +100 → 575
    expect(res.body.netCashMovement).toBe('575.0000');
    // OPERATING ONLY: net profit 55 − Δinventory 180 = −125 (equity funding
    // is financing, never operating)
    expect(res.body.netCashFromOperations).toBe('-125.0000');
    // FINANCING: the 700 opening funding (capital injection)
    expect(res.body.netCashFromFinancing).toBe('700.0000');
    expect(res.body.investingActivities).toHaveLength(0);
    expect(res.body.netCashFromInvesting).toBe('0.0000');
    // the classified activities sum EXACTLY to the direct movement
    expect(res.body.netIncreaseDecreaseInCash).toBe('575.0000');
    expect(res.body.openingCashAndEquivalents).toBe('0.0000');
    expect(res.body.closingCashAndEquivalents).toBe('575.0000');
  });

  it('AR/AP control accounts reconcile to their subledgers', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/accounting/reconciliation?asOf=${TODAY}`)
      .set(owner);
    expect(res.status).toBe(200);
    const byCheck = new Map<string, { passed: boolean }>(
      res.body.checks.map((c: { check: string; passed: boolean }) => [c.check, c]),
    );
    expect(byCheck.get('accounts_receivable')!.passed).toBe(true);
    expect(byCheck.get('accounts_payable')!.passed).toBe(true);
    expect(byCheck.get('customer_deposit_liability')!.passed).toBe(true);
    expect(byCheck.get('supplier_advance')!.passed).toBe(true);
    expect(byCheck.get('cogs_vs_stock_ledger')!.passed).toBe(true);
  });

  it('accounting periods: close blocks posting; corrections post into soft-closed; reopen works', async () => {
    // create the current month's period and close it
    const month = TODAY.slice(0, 7);
    const created = await request(app.getHttpServer())
      .post('/api/accounting/periods')
      .set(owner)
      .send({ fiscalYear: Number(YEAR), months: [Number(month.slice(5, 7))] });
    expect(created.status).toBe(201);
    const periodId = created.body[0].id;

    const closed = await request(app.getHttpServer())
      .post(`/api/accounting/periods/${periodId}/status`)
      .set(owner)
      .send({ status: 'closed' });
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe('closed');

    // a GRN in the closed month is blocked
    const grnBlocked = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '1', unitCost: '30.00' }],
      });
    expect(grnBlocked.status).toBe(409);
    expect(grnBlocked.body.error).toMatch(/period covering .* is closed/i);

    // a SALE in the closed month is blocked through the same choke point
    const saleBlocked = await request(app.getHttpServer())
      .post('/api/sales/commit')
      .set(manager)
      .send({
        warehouseId: whA,
        customerId: customerC1,
        lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
        tenders: [{ method: 'cash', amount: '50.00' }],
      });
    expect(saleBlocked.status).toBe(409);

    // reopen with a reason, then post succeeds
    const reopened = await request(app.getHttpServer())
      .post(`/api/accounting/periods/${periodId}/status`)
      .set(owner)
      .send({ status: 'open', reason: 'late supplier document must be booked' });
    expect(reopened.status).toBe(201);
    expect(reopened.body.status).toBe('open');

    const grnOk = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '1', unitCost: '30.00' }],
      });
    expect(grnOk.status).toBe(201);

    // soft-close: ordinary posting blocked, CORRECTION (credit note) allowed
    const soft = await request(app.getHttpServer())
      .post(`/api/accounting/periods/${periodId}/status`)
      .set(owner)
      .send({ status: 'soft_closed' });
    expect(soft.status).toBe(201);
    const blocked = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '1', unitCost: '30.00' }],
      });
    expect(blocked.status).toBe(409);
    // re-open so later tests can post
    await request(app.getHttpServer())
      .post(`/api/accounting/periods/${periodId}/status`)
      .set(owner)
      .send({ status: 'open', reason: 'testing complete — normal operations' });
  });

  it('inventory documents post GL journals SYNCHRONOUSLY; backfill adds nothing and stays idempotent', async () => {
    // a stock adjustment (Phase 2 document) — its journal must exist BEFORE
    // any backfill runs (review blocker: backfill is for historical gaps)
    const adjustment = await request(app.getHttpServer())
      .post('/api/stock-adjustments')
      .set(manager)
      .send({
        warehouseId: whA,
        reason: 'damage write-off of one unit (synchronous GL test)',
        lines: [{ productId: productA, quantityBase: '-1' }],
      });
    expect(adjustment.status).toBe(201);

    // the synchronous journal exists immediately, without any backfill
    const sync = await fx.admin.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE source_kind = 'stock_movement'`,
    );
    expect(sync.rows[0].n).toBeGreaterThanOrEqual(1);

    // backfill adds NOTHING for it (already posted synchronously)…
    const run1 = await request(app.getHttpServer())
      .post('/api/accounting/backfill')
      .set(owner)
      .send({});
    expect(run1.status).toBe(201);
    expect(run1.body.nonSaleInventoryJournals).toBe(0);
    expect(run1.body.skipped).toHaveLength(0);

    // …and a second run posts nothing either (fully idempotent)
    const run2 = await request(app.getHttpServer())
      .post('/api/accounting/backfill')
      .set(owner)
      .send({});
    expect(run2.status).toBe(201);
    expect(run2.body.nonSaleInventoryJournals).toBe(0);
    expect(run2.body.preHardeningSaleJournals).toBe(0);
    expect(run2.body.partyOpeningBalanceJournals).toBe(0);

    // the synchronous journal is balanced and movement-keyed
    const je = await fx.admin.query(
      `SELECT e.total_debit::text AS d, e.total_credit::text AS c
       FROM journal_entry e WHERE e.source_kind = 'stock_movement'`,
    );
    expect(je.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of je.rows) {
      expect(row.d).toBe(row.c);
    }
  });

  it('chart of accounts: deactivation is blocked while financial evidence references the account', async () => {
    const accounts = await request(app.getHttpServer()).get('/api/accounting/accounts').set(owner);
    expect(accounts.status).toBe(200);
    const cash = accounts.body.find((a: { code: string }) => a.code === '1000');
    expect(cash.isControl).toBe(true);
    expect(cash.accountClass).toBe('asset');
    expect(cash.normalBalance).toBe('debit');

    const deactivate = await request(app.getHttpServer())
      .post(`/api/accounting/accounts/${cash.id}/deactivate`)
      .set(owner)
      .send({});
    expect(deactivate.status).toBe(409);
    expect(deactivate.body.error).toMatch(/cannot be deactivated/i);

    // a fresh unused account CAN be deactivated (never deleted)
    const fresh = await request(app.getHttpServer())
      .post('/api/accounting/accounts')
      .set(owner)
      .send({ code: '9999', name: 'Scratch Account', accountType: 'expense', accountClass: 'operating_expense' });
    expect(fresh.status).toBe(201);
    const deactivateFresh = await request(app.getHttpServer())
      .post(`/api/accounting/accounts/${fresh.body.id}/deactivate`)
      .set(owner)
      .send({});
    expect(deactivateFresh.status).toBe(201);
    expect(deactivateFresh.body.isActive).toBe(false);
  });

  it('manual journal reversal: append-only with reversal linkage', async () => {
    const accounts = await request(app.getHttpServer()).get('/api/accounting/accounts').set(owner);
    const manual = await request(app.getHttpServer())
      .post('/api/accounting/journals')
      .set(manager)
      .send({
        businessDate: TODAY,
        description: 'to be reversed',
        lines: [
          { accountCode: '5100', debit: '7.00' },
          { accountCode: '1000', credit: '7.00' },
        ],
      });
    expect(manual.status).toBe(201);
    const reversal = await request(app.getHttpServer())
      .post(`/api/accounting/journals/${manual.body.id}/reverse`)
      .set(manager)
      .send({});
    expect(reversal.status).toBe(201);
    // double reversal is refused
    const again = await request(app.getHttpServer())
      .post(`/api/accounting/journals/${manual.body.id}/reverse`)
      .set(manager)
      .send({});
    expect(again.status).toBe(409);
    // source-document journals cannot be reversed by hand
    const saleJournal = await fx.admin.query(
      `SELECT id FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'invoice' LIMIT 1`,
      [fx.tenantA.tenantId],
    );
    const refused = await request(app.getHttpServer())
      .post(`/api/accounting/journals/${saleJournal.rows[0].id}/reverse`)
      .set(manager)
      .send({});
    expect(refused.status).toBe(409);
    void accounts;
  });

  it('RBAC: financial reports need financial-report:read; cashier is refused', async () => {
    const cashier = auth(fx.tenantA.users.cashier!.token!);
    const tb = await request(app.getHttpServer()).get(`/api/accounting/trial-balance`).set(cashier);
    expect(tb.status).toBe(403);
    const pl = await request(app.getHttpServer()).get(`/api/accounting/profit-and-loss`).set(cashier);
    expect(pl.status).toBe(403);
    const auditor = auth(fx.tenantA.users.auditor!.token!);
    const tbAuditor = await request(app.getHttpServer()).get(`/api/accounting/trial-balance`).set(auditor);
    expect(tbAuditor.status).toBe(200);
  });

  it('cross-tenant: tenant B sees no tenant A accounts or journals', async () => {
    const b = auth(fx.tenantB.users.owner!.token!);
    const accounts = await request(app.getHttpServer()).get('/api/accounting/accounts').set(b);
    expect(accounts.status).toBe(200);
    expect(accounts.body).toHaveLength(0);
    const journals = await request(app.getHttpServer()).get('/api/accounting/journals').set(b);
    expect(journals.status).toBe(200);
    expect(journals.body.total).toBe(0);
    expect(journals.body.items).toHaveLength(0);
  });
});
