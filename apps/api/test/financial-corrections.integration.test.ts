/**
 * Phase 4 — second independent review round: financial corrections
 * (review 5757928626 findings, blockers 1–5).
 *
 * BLOCKER 1 — cash-flow sign logic + activity classification:
 *   the indirect build-up pushed credit-normal LIABILITIES with the raw
 *   debit−credit (an unpaid GRN reported its GR/IR funding as −100
 *   instead of +100) and mixed equity financing into
 *   netCashFromOperations. Rebuilt from the ledger identity
 *   Σ(D−C)=0: contribution = credit − debit for every non-cash
 *   balance-sheet account; operating / investing / financing are
 *   classified separately and must reconcile EXACTLY to the direct
 *   cash-control movement (unexplained == 0, no plug).
 *
 * BLOCKER 2 — AR/AP/deposit reconciliation sign normalization
 *   (gl_account.normal_balance) + posted-only AP scope.
 *
 * BLOCKER 3 — synchronous GL posting + period locks for inventory
 *   documents; backfill can never double-post a synchronous journal.
 *
 * BLOCKER 4 — as-of date scoping everywhere (timeline tests on three
 *   distinct dates per document family).
 *
 * BLOCKER 5 — supplier statement double-counting of adjustments.
 *
 * Every assertion is an exact expected value derived from the posting
 * rules (never merely "the endpoint responded").
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);
const JAN1 = `${YEAR}-01-01`;
const YESTERDAY = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Binds the fixture's HTTP server to an ephemeral port and returns the base
 * URL. Supertest manages a passed-in server itself and closes it after each
 * test's final request — a fast-following next test can race that close
 * (server.address() === null → TypeError inside supertest). Requesting an
 * explicit base URL sidesteps the server management entirely.
 */
async function listenFixture(fx: ApiFixture): Promise<string> {
  const server = await fx.app.listen(0);
  const addr = server.address() as { port: number };
  return `http://127.0.0.1:${addr.port}`;
}

interface CfShape {
  netProfit: string;
  operatingAssetChanges: Array<{ accountCode: string; amount: string }>;
  operatingLiabilityChanges: Array<{ accountCode: string; amount: string }>;
  netCashFromOperations: string;
  netCashFromInvesting: string;
  financingActivities: Array<{ accountCode: string; amount: string }>;
  netCashFromFinancing: string;
  netIncreaseDecreaseInCash: string;
  openingCashAndEquivalents: string;
  closingCashAndEquivalents: string;
  netCashMovement: string;
  unexplained: string;
}

/** Exact cash-flow assertion: expected operating lines by account code,
 *  net figures and the hard identity invariants (never a plug). */
function expectCashFlow(
  cf: CfShape,
  expected: {
    netProfit: string;
    opLines: Record<string, string>; // accountCode → signed cash-effect
    netCashFromOperations: string;
    netCashFromFinancing: string;
    netIncreaseDecreaseInCash: string;
    netCashMovement: string;
  },
) {
  expect(cf.unexplained).toBe('0.0000'); // identity invariant — NEVER plugged
  expect(cf.netProfit).toBe(expected.netProfit);
  expect(cf.netCashFromOperations).toBe(expected.netCashFromOperations);
  expect(cf.netCashFromFinancing).toBe(expected.netCashFromFinancing);
  expect(cf.netIncreaseDecreaseInCash).toBe(expected.netIncreaseDecreaseInCash);
  expect(cf.netCashMovement).toBe(expected.netCashMovement);
  const op = new Map<string, string>();
  for (const l of cf.operatingAssetChanges) op.set(l.accountCode, l.amount);
  for (const l of cf.operatingLiabilityChanges) op.set(l.accountCode, l.amount);
  const expectedNonZero = Object.entries(expected.opLines).filter(([, v]) => v !== '0.0000');
  expect(new Set([...op.keys()])).toEqual(new Set(expectedNonZero.map(([k]) => k)));
  for (const [code, amount] of expectedNonZero) {
    expect(op.get(code)).toBe(amount);
  }
  // the classified activities must sum EXACTLY to the direct movement
  expect(
    (Number(cf.netCashFromOperations) +
      Number(cf.netCashFromInvesting) +
      Number(cf.netCashFromFinancing)).toFixed(4),
  ).toBe(Number(cf.netCashMovement).toFixed(4));
}

/* ================================================================== */
/* BLOCKER 1 — cash flow: signs, classification, exact reconciliation */
/* ================================================================== */
describe('Blocker 1: cash-flow classification (12-scenario timeline)', () => {
  let fx: ApiFixture;
  let base: string;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productP1: string;
  let supplierS1: string;
  let customerC1: string;
  let bank1Id: string;
  let bank2Id: string;
  let depositId: string;
  let grn1LineId: string;

  const cf = async (): Promise<CfShape> => {
    const res = await request(base)
      .get(`/api/accounting/cash-flow?from=${JAN1}&to=${TOMORROW}`)
      .set(owner);
    expect(res.status).toBe(200);
    return res.body;
  };

  beforeAll(async () => {
    fx = await createApiFixture();
    base = await listenFixture(fx);
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    const wh = async (code: string) =>
      (await request(base).post('/api/warehouses').set(owner).send({ code, name: code })).body.id;
    whA = await wh('CF-WH1');
    unitPc = (await request(base).post('/api/units').set(owner).send({ code: 'CF-PC', name: 'Pieces' })).body.id;
    productP1 = (
      await request(base).post('/api/products').set(owner).send({
        code: 'CF-P1', name: 'CF P1', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00',
      })
    ).body.id;
    supplierS1 = (await request(base).post('/api/suppliers').set(owner).send({ name: 'CF Supplier', phone: '0201111111' })).body.id;
    customerC1 = (await request(base).post('/api/customers').set(owner).send({ name: 'CF Customer', phone: '0241111111' })).body.id;
    // two dedicated bank GL accounts + bank masters (transfer / fee scenarios)
    for (const code of ['CF-BNK1', 'CF-BNK2']) {
      await fx.admin.query(
        `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance)
         VALUES ($1, $2, $2, 'asset', 'asset', 'debit')`,
        [fx.tenantA.tenantId, code],
      );
    }
    bank1Id = (
      await request(base).post('/api/banking/accounts').set(manager).send({
        code: 'CF-B1', bankName: 'CF Bank', accountName: 'Main', accountNumber: '111111', glAccountCode: 'CF-BNK1',
      })
    ).body.id;
    bank2Id = (
      await request(base).post('/api/banking/accounts').set(manager).send({
        code: 'CF-B2', bankName: 'CF Bank', accountName: 'Second', accountNumber: '222222', glAccountCode: 'CF-BNK2',
      })
    ).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('scenario 7+8: capital injection and owner distribution are FINANCING, never operating', async () => {
    // [7] capital injection: Dr cash 500 / Cr opening-balance equity 500
    const inject = await request(base).post('/api/accounting/journals').set(manager).send({
      businessDate: TODAY,
      description: 'owner capital injection (cash)',
      lines: [
        { accountCode: '1000', debit: '500.00', memo: 'capital in' },
        { accountCode: '3950', credit: '500.00', memo: 'capital injection' },
      ],
    });
    expect(inject.status).toBe(201);

    // [8] owner distribution: dedicated equity account, Dr drawings / Cr cash
    const dist = await request(base).post('/api/accounting/accounts').set(owner).send({
      code: 'CF-3990', name: 'Owner Distributions', accountType: 'equity', accountClass: 'equity',
    });
    expect(dist.status).toBe(201);
    const payout = await request(base).post('/api/accounting/journals').set(manager).send({
      businessDate: TODAY,
      description: 'owner cash distribution',
      lines: [
        { accountCode: 'CF-3990', debit: '120.00', memo: 'distribution' },
        { accountCode: '1000', credit: '120.00', memo: 'distribution paid' },
      ],
    });
    expect(payout.status).toBe(201);

    expectCashFlow(await cf(), {
      netProfit: '0.0000',
      opLines: {},
      netCashFromOperations: '0.0000', // equity movements are NOT operating
      netCashFromFinancing: '380.0000', // +500 injection − 120 distribution
      netIncreaseDecreaseInCash: '380.0000',
      netCashMovement: '380.0000',
    });
  });

  it('scenario 1: unpaid GRN — inventory −100 EXACTLY offset by GR/IR +100, net cash zero', async () => {
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: supplierS1, warehouseId: whA, businessDate: TODAY,
      lines: [{ productId: productP1, receivedQuantity: '10', unitCost: '10.00' }],
    });
    expect(grn.status).toBe(201);
    grn1LineId = grn.body.lines[0].id;

    const r = await cf();
    expectCashFlow(r, {
      netProfit: '0.0000',
      opLines: { '1200': '-100.0000', '2310': '100.0000' }, // the blocker's exact example
      netCashFromOperations: '0.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '380.0000',
      netCashMovement: '380.0000',
    });
  });

  it('scenario 2: GRN invoiced but unpaid — liability moves GR/IR → AP, cash still zero', async () => {
    const inv = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId: supplierS1, supplierInvoiceNumber: 'CF-INV-1', supplierInvoiceDate: TODAY,
      dueDate: TODAY, businessDate: TODAY, post: true,
      lines: [{ goodsReceiptLineId: grn1LineId, productId: productP1, description: 'cf purchase', quantityBase: '10', unitPrice: '10.00' }],
    });
    expect(inv.status).toBe(201);
    expect(inv.body.total).toBe('100.0000');

    expectCashFlow(await cf(), {
      netProfit: '0.0000',
      opLines: { '1200': '-100.0000', '2300': '100.0000' },
      netCashFromOperations: '0.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '380.0000',
      netCashMovement: '380.0000',
    });
  });

  it('scenario 3: partially paid supplier invoice — AP +40 funds the −60 cash out', async () => {
    const pay = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: TODAY, amount: '60.00', method: 'cash',
      allocations: [{ supplierInvoiceId: (await latestApInvoice()).id, amount: '60.0000' }],
    });
    expect(pay.status).toBe(201);

    expectCashFlow(await cf(), {
      netProfit: '0.0000',
      opLines: { '1200': '-100.0000', '2300': '40.0000' },
      netCashFromOperations: '-60.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '320.0000',
      netCashMovement: '320.0000',
    });
  });

  it('scenario 4: fully settled supplier invoice — liability fully unwinds', async () => {
    const pay = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: TODAY, amount: '40.00', method: 'cash',
      allocations: [{ supplierInvoiceId: (await latestApInvoice()).id, amount: '40.0000' }],
    });
    expect(pay.status).toBe(201);

    expectCashFlow(await cf(), {
      netProfit: '0.0000',
      opLines: { '1200': '-100.0000' },
      netCashFromOperations: '-100.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '280.0000',
      netCashMovement: '280.0000',
    });
  });

  it('scenario 6: supplier advance — unapplied payment is a working-capital ASSET increase (−80)', async () => {
    const pay = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: TODAY, amount: '80.00', method: 'cash', allocations: [],
    });
    expect(pay.status).toBe(201);

    expectCashFlow(await cf(), {
      netProfit: '0.0000',
      opLines: { '1200': '-100.0000', '1310': '-80.0000' },
      netCashFromOperations: '-180.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '200.0000',
      netCashMovement: '200.0000',
    });
  });

  it('scenario 9+10: bank-to-bank transfer is net-zero; the fee alone moves cash', async () => {
    // fund bank1 from cash (cash → bank, still inside cash & equivalents)
    const fund = await request(base).post('/api/accounting/journals').set(manager).send({
      businessDate: TODAY,
      description: 'fund the main bank account',
      lines: [
        { accountCode: 'CF-BNK1', debit: '300.00', memo: 'bank funding' },
        { accountCode: '1000', credit: '300.00', memo: 'bank funding' },
      ],
    });
    expect(fund.status).toBe(201);
    const trf = await request(base).post('/api/banking/transfers').set(manager).send({
      fromBankAccountId: bank1Id, toBankAccountId: bank2Id, businessDate: TODAY, amount: '100.00', fee: '5.00',
    });
    expect(trf.status).toBe(201);

    expectCashFlow(await cf(), {
      netProfit: '-5.0000', // only the fee hits the P&L
      opLines: { '1200': '-100.0000', '1310': '-80.0000' },
      netCashFromOperations: '-185.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '195.0000',
      netCashMovement: '195.0000',
    });
  });

  it('scenario 11: operating expense (rent) reduces operating cash exactly', async () => {
    const rent = await request(base).post('/api/accounting/journals').set(manager).send({
      businessDate: TODAY,
      description: 'monthly rent',
      lines: [
        { accountCode: '5100', debit: '20.00', memo: 'rent' },
        { accountCode: '1000', credit: '20.00', memo: 'rent paid' },
      ],
    });
    expect(rent.status).toBe(201);

    expectCashFlow(await cf(), {
      netProfit: '-25.0000',
      opLines: { '1200': '-100.0000', '1310': '-80.0000' },
      netCashFromOperations: '-205.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '175.0000',
      netCashMovement: '175.0000',
    });
  });

  it('scenario 5a: customer deposit received — liability increase funds cash (+200)', async () => {
    const dep = await request(base).post('/api/deposits').set(manager).send({
      customerId: customerC1, amount: '200.00', tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(dep.status).toBe(201);
    depositId = dep.body.id;

    expectCashFlow(await cf(), {
      netProfit: '-25.0000',
      opLines: { '1200': '-100.0000', '1310': '-80.0000', '2100': '200.0000' },
      netCashFromOperations: '-5.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '375.0000',
      netCashMovement: '375.0000',
    });
  });

  it('scenario 12a: inventory purchase paid cash — asset increase consumes cash exactly', async () => {
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: supplierS1, warehouseId: whA, businessDate: TODAY,
      lines: [{ productId: productP1, receivedQuantity: '10', unitCost: '30.00' }],
    });
    expect(grn.status).toBe(201);
    const inv = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId: supplierS1, supplierInvoiceNumber: 'CF-INV-2', supplierInvoiceDate: TODAY,
      dueDate: TODAY, businessDate: TODAY, post: true,
      lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productP1, description: 'cf purchase 2', quantityBase: '10', unitPrice: '30.00' }],
    });
    expect(inv.status).toBe(201);
    const pay = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: TODAY, amount: '300.00', method: 'cash',
      allocations: [{ supplierInvoiceId: inv.body.id, amount: '300.0000' }],
    });
    expect(pay.status).toBe(201);

    expectCashFlow(await cf(), {
      netProfit: '-25.0000',
      opLines: { '1200': '-400.0000', '1310': '-80.0000', '2100': '200.0000' },
      netCashFromOperations: '-305.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '75.0000',
      netCashMovement: '75.0000',
    });
  });

  it('scenario 12b: inventory sale for cash — profit and inventory shrinkage net exactly', async () => {
    const sale = await request(base).post('/api/sales/commit').set(manager).send({
      warehouseId: whA, customerId: customerC1,
      lines: [{ productId: productP1, quantityBase: '4', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(sale.status).toBe(201);
    expect(sale.body.invoice.costTotal).toBe('80.0000'); // AVCO (100+300)/20 = 20/unit

    expectCashFlow(await cf(), {
      netProfit: '95.0000', // −25 + 200 revenue − 80 COGS
      opLines: { '1200': '-320.0000', '1310': '-80.0000', '2100': '200.0000' },
      netCashFromOperations: '-105.0000',
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '275.0000',
      netCashMovement: '275.0000',
    });
  });

  it('scenario 5b: customer deposit consumed by a sale — liability unwinds, no cash moves', async () => {
    const sale = await request(base).post('/api/sales/commit').set(manager).send({
      warehouseId: whA, customerId: customerC1,
      lines: [{ productId: productP1, quantityBase: '3', unitPrice: '50.00' }],
      tenders: [{ method: 'credit', amount: '150.00', depositId }],
    });
    expect(sale.status).toBe(201);
    expect(sale.body.invoice.amountDue).toBe('0.0000');

    expectCashFlow(await cf(), {
      netProfit: '185.0000', // 95 + 150 revenue − 60 COGS
      opLines: { '1200': '-260.0000', '1310': '-80.0000', '2100': '50.0000' },
      netCashFromOperations: '-105.0000', // unchanged: the sale consumed no cash
      netCashFromFinancing: '380.0000',
      netIncreaseDecreaseInCash: '275.0000',
      netCashMovement: '275.0000',
    });

    // closing reconciliation: opening (0) + net == the direct ledger Σ over
    // the cash controls as of `to` (asserted against the raw ledger)
    const direct = await fx.admin.query(
      `SELECT (COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0))::text AS closing
       FROM journal_line l
       JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
       JOIN gl_account a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
       LEFT JOIN gl_mapping m ON m.account_id = a.id AND m.tenant_id = a.tenant_id
       LEFT JOIN bank_account ba ON ba.gl_account_id = a.id AND ba.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1
         AND COALESCE(e.business_date, e.occurred_at::date) <= $2::date
         AND ((m.purpose IN ('cash','bank_clearing','momo_clearing','cheque_clearing')) OR ba.id IS NOT NULL)`,
      [fx.tenantA.tenantId, TOMORROW],
    );
    const r = await cf();
    expect(r.closingCashAndEquivalents).toBe(direct.rows[0]!.closing);
    expect(r.openingCashAndEquivalents).toBe('0.0000');
  });

  /** Latest posted AP invoice helper (the scenario walks one invoice). */
  async function latestApInvoice(): Promise<{ id: string }> {
    const list = await request(base)
      .get(`/api/purchasing/supplier-invoices?supplierId=${supplierS1}&limit=50`)
      .set(owner);
    expect(list.status).toBe(200);
    const open = (list.body as Array<{ id: string; status: string; amountOpen: string }>)
      .filter((i) => ['posted', 'partially_paid', 'paid'].includes(i.status))
      .find((i) => Number(i.amountOpen) > 0);
    if (!open) {
      throw new Error(`no open AP invoice — list: ${JSON.stringify(list.body).slice(0, 600)}`);
    }
    return { id: open.id };
  }
});

/* ================================================================== */
/* BLOCKER 2 — reconciliation signs, posted-only scope, exact values  */
/* ================================================================== */
describe('Blocker 2: AR/AP/deposit reconciliation normalization + scope', () => {
  let fx: ApiFixture;
  let base: string;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productR: string;
  let supplierS1: string;
  let supplierS2: string;
  let customerC1: string;
  let customerC2: string;

  const auth2 = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Full reconciliation result → checks by name (exact-value assertions). */
  async function recon(asOf = TODAY) {
    const res = await request(base)
      .get(`/api/accounting/reconciliation?asOf=${asOf}`)
      .set(owner);
    expect(res.status).toBe(200);
    const map = new Map<string, { controlBalance: string; subledgerBalance: string; difference: string; passed: boolean }>();
    for (const c of res.body.checks) map.set(c.check, c);
    return map;
  }

  async function invoiceFromGrn(opts: {
    supplierId: string; number: string; qty: string; unitCost: string; post: boolean;
  }): Promise<{ invoiceId: string; grnLineId: string }> {
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: opts.supplierId, warehouseId: whA, businessDate: TODAY,
      lines: [{ productId: productR, receivedQuantity: opts.qty, unitCost: opts.unitCost }],
    });
    expect(grn.status).toBe(201);
    const inv = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId: opts.supplierId, supplierInvoiceNumber: opts.number, supplierInvoiceDate: TODAY,
      businessDate: TODAY, post: opts.post,
      lines: [{
        goodsReceiptLineId: grn.body.lines[0].id, productId: productR,
        description: 'recon scenario', quantityBase: opts.qty, unitPrice: opts.unitCost,
      }],
    });
    expect(inv.status).toBe(201);
    return { invoiceId: inv.body.id, grnLineId: grn.body.lines[0].id };
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    base = await listenFixture(fx);
    owner = auth2(fx.tenantA.users.owner!.token!);
    manager = auth2(fx.tenantA.users.manager!.token!);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    whA = (await request(base).post('/api/warehouses').set(owner).send({ code: 'RC-WH', name: 'RC WH' })).body.id;
    unitPc = (await request(base).post('/api/units').set(owner).send({ code: 'RC-PC', name: 'Pieces' })).body.id;
    productR = (
      await request(base).post('/api/products').set(owner).send({
        code: 'RC-P', name: 'RC P', baseUnitId: unitPc, sellingPrice: '40.00', purchasePrice: '25.00',
      })
    ).body.id;
    supplierS1 = (await request(base).post('/api/suppliers').set(owner).send({ name: 'RC Supplier One', phone: '0202222222' })).body.id;
    supplierS2 = (await request(base).post('/api/suppliers').set(owner).send({ name: 'RC Supplier Two', phone: '0203333333' })).body.id;
    customerC1 = (await request(base).post('/api/customers').set(owner).send({ name: 'RC Customer One', phone: '0242222222' })).body.id;
    customerC2 = (await request(base).post('/api/customers').set(owner).send({ name: 'RC Customer Two', phone: '0243333333' })).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('nonzero unpaid AP: normalized control == +subledger (not −100)', async () => {
    const { invoiceId } = await invoiceFromGrn({ supplierId: supplierS1, number: 'RC-INV-1', qty: '4', unitCost: '25.00', post: true });
    const r = await recon();
    // 4 × 25 = 100 AP on the credit-normal control → normalized +100
    expect(r.get('accounts_payable')!.controlBalance).toBe('100.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('100.0000');
    expect(r.get('accounts_payable')!.difference).toBe('0.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
    void invoiceId;
  });

  it('partially paid AP: both sides at 40.0000', async () => {
    const list = await request(base)
      .get(`/api/purchasing/supplier-invoices?supplierId=${supplierS1}`).set(owner);
    const inv = (list.body as Array<{ id: string; amountOpen: string }>).find((i) => Number(i.amountOpen) === 100)!;
    const pay = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: TODAY, amount: '60.00', method: 'cash',
      allocations: [{ supplierInvoiceId: inv.id, amount: '60.0000' }],
    });
    expect(pay.status).toBe(201);
    const r = await recon();
    expect(r.get('accounts_payable')!.controlBalance).toBe('40.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('40.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
  });

  it('supplier advance: unapplied payment reconciles on the debit-normal asset control', async () => {
    const pay = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS2, businessDate: TODAY, amount: '80.00', method: 'cash', allocations: [],
    });
    expect(pay.status).toBe(201);
    const r = await recon();
    expect(r.get('supplier_advance')!.controlBalance).toBe('80.0000');
    expect(r.get('supplier_advance')!.subledgerBalance).toBe('80.0000');
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('nonzero customer deposit: credit-normal control == +deposit', async () => {
    const dep = await request(base).post('/api/deposits').set(manager).send({
      customerId: customerC1, amount: '200.00', tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(dep.status).toBe(201);
    const r = await recon();
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('200.0000');
    expect(r.get('customer_deposit_liability')!.subledgerBalance).toBe('200.0000');
    expect(r.get('customer_deposit_liability')!.passed).toBe(true);
  });

  it('partially consumed customer deposit: both sides at 50.0000', async () => {
    // a sale on AR to apply the deposit against (4 × 40 = 160 due)
    const sale = await request(base).post('/api/sales/commit').set(manager).send({
      warehouseId: whA, customerId: customerC1,
      lines: [{ productId: productR, quantityBase: '4', unitPrice: '40.00' }],
      tenders: [],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;
    const deps = await request(base)
      .get(`/api/deposits?customerId=${customerC1}`).set(owner);
    expect(deps.status).toBe(200);
    const deposit = (deps.body.items as Array<{ id: string }>)[0]!;
    const apply = await request(base).post('/api/credits/apply').set(manager).send({
      depositId: deposit.id, invoiceId, amount: '150.0000',
    });
    expect(apply.status).toBe(201);
    const r = await recon();
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('50.0000');
    expect(r.get('customer_deposit_liability')!.subledgerBalance).toBe('50.0000');
    expect(r.get('customer_deposit_liability')!.passed).toBe(true);
  });

  it('pending-match (unposted) invoice does NOT move either side of the AP check', async () => {
    const before = await recon();
    await invoiceFromGrn({ supplierId: supplierS2, number: 'RC-INV-PENDING', qty: '3', unitCost: '25.00', post: false });
    const after = await recon();
    // the unposted invoice (75.00) must not increase the posted AP liability…
    expect(after.get('accounts_payable')!.subledgerBalance).toBe(before.get('accounts_payable')!.subledgerBalance);
    expect(after.get('accounts_payable')!.controlBalance).toBe(before.get('accounts_payable')!.controlBalance);
    expect(after.get('accounts_payable')!.passed).toBe(true);
    // …and an adjustment against it is REFUSED (no AP evidence without the invoice)
    const list = await request(base)
      .get(`/api/purchasing/supplier-invoices?supplierId=${supplierS2}&status=pending_match`).set(owner);
    const pending = (list.body as Array<{ id: string }>)[0]!;
    const refused = await request(base).post('/api/purchasing/supplier-adjustments').set(manager).send({
      kind: 'debit_note', supplierId: supplierS2, supplierInvoiceId: pending.id, businessDate: TODAY,
      reason: 'note against an unposted invoice must be refused', adjustmentClass: 'price_correction', amount: '5.0000',
    });
    expect(refused.status).toBe(409);
  });

  it('posted invoice with a debit note: adjustment appears on BOTH sides exactly once', async () => {
    const { invoiceId } = await invoiceFromGrn({ supplierId: supplierS2, number: 'RC-INV-2', qty: '2', unitCost: '25.00', post: true });
    const dn = await request(base).post('/api/purchasing/supplier-adjustments').set(manager).send({
      kind: 'debit_note', supplierId: supplierS2, supplierInvoiceId: invoiceId, businessDate: TODAY,
      reason: 'retroactive freight surcharge (recon test)', adjustmentClass: 'price_correction', amount: '10.0000',
    });
    expect(dn.status).toBe(201);
    const r = await recon();
    // prior AP 40 + this invoice 50 + note 10 = 100
    expect(r.get('accounts_payable')!.controlBalance).toBe('100.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('100.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
  });

  it('corrected invoice: credit note to zero keeps both sides aligned', async () => {
    const { invoiceId } = await invoiceFromGrn({ supplierId: supplierS2, number: 'RC-INV-3', qty: '1', unitCost: '25.00', post: true });
    const cn = await request(base).post('/api/purchasing/supplier-adjustments').set(manager).send({
      kind: 'credit_note', supplierId: supplierS2, supplierInvoiceId: invoiceId, businessDate: TODAY,
      reason: 'full correction of the invoice (recon test)', adjustmentClass: 'price_correction', amount: '25.0000',
    });
    expect(cn.status).toBe(201);
    const r = await recon();
    expect(r.get('accounts_payable')!.difference).toBe('0.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
  });

  it('multiple suppliers and customers: every check still reconciles exactly', async () => {
    // second customer deposit
    const dep = await request(base).post('/api/deposits').set(manager).send({
      customerId: customerC2, amount: '60.00', tenders: [{ method: 'cash', amount: '60.00' }],
    });
    expect(dep.status).toBe(201);
    // second supplier invoice
    await invoiceFromGrn({ supplierId: supplierS1, number: 'RC-INV-4', qty: '1', unitCost: '25.00', post: true });
    const r = await recon();
    for (const name of ['accounts_receivable', 'accounts_payable', 'customer_deposit_liability', 'supplier_advance', 'cogs_vs_stock_ledger']) {
      expect(r.get(name)!.passed, `${name} must pass`).toBe(true);
      expect(r.get(name)!.difference).toBe('0.0000');
    }
    // customer deposits: 50 (C1) + 60 (C2) = 110
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('110.0000');
    expect(r.get('customer_deposit_liability')!.subledgerBalance).toBe('110.0000');
  });
});

/* ================================================================== */
/* BLOCKER 3 — synchronous GL posting, period locks, deep rollback    */
/* ================================================================== */
describe('Blocker 3: inventory-to-GL synchronous posting + period locks', () => {
  let fx: ApiFixture;
  let base: string;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let whB: string;
  let unitPc: string;
  let productA: string;

  /** journal lines (purpose → debit/credit) of the synchronous movement journal */
  async function syncJournal(movementId: string) {
    const res = await fx.admin.query(
      `SELECT COALESCE(m.purpose, a.code) AS key, l.debit::text AS d, l.credit::text AS c
       FROM journal_entry e
       JOIN journal_line l ON l.entry_id = e.id AND l.tenant_id = e.tenant_id
       LEFT JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       LEFT JOIN gl_account a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
       WHERE e.tenant_id = $1 AND e.source_kind = 'stock_movement' AND e.source_id = $2`,
      [fx.tenantA.tenantId, movementId],
    );
    const out: Record<string, { d: string; c: string }> = {};
    for (const r of res.rows) out[String(r.key)] = { d: String(r.d), c: String(r.c) };
    return out;
  }

  async function latestMovements(documentId: string, n: number) {
    const res = await fx.admin.query(
      `SELECT id FROM stock_movement
       WHERE tenant_id = $1 AND source_document_type = 'stock_adjustment' AND source_document_id = $2
       ORDER BY occurred_at, id`,
      [fx.tenantA.tenantId, documentId],
    );
    return res.rows.slice(0, n).map((r) => String(r.id));
  }

  function counts() {
    return Promise.all([
      fx.admin.query(`SELECT count(*)::int AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'stock_movement'`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT count(*)::int AS n FROM stock_adjustment WHERE tenant_id = $1`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT count(*)::int AS n FROM stock_movement WHERE tenant_id = $1`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT count(*)::int AS n FROM audit_event WHERE tenant_id = $1 AND entity_type = 'stock_adjustment'`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT count(*)::int AS n FROM outbox_event WHERE tenant_id = $1 AND type = 'StockAdjustmentPosted'`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT quantity_base::text AS q, total_value::text AS v FROM stock_cost_state WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`, [fx.tenantA.tenantId, whA, productA]),
    ]);
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    base = await listenFixture(fx);
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    whA = (await request(base).post('/api/warehouses').set(owner).send({ code: 'GL-WH1', name: 'GL WH1' })).body.id;
    whB = (await request(base).post('/api/warehouses').set(owner).send({ code: 'GL-WH2', name: 'GL WH2' })).body.id;
    unitPc = (await request(base).post('/api/units').set(owner).send({ code: 'GL-PC', name: 'Pieces' })).body.id;
    productA = (
      await request(base).post('/api/products').set(owner).send({
        code: 'GL-PA', name: 'GL PA', baseUnitId: unitPc, sellingPrice: '20.00', purchasePrice: '12.00',
      })
    ).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('opening stock posts Dr inventory / Cr opening_balance_equity SYNCHRONOUSLY', async () => {
    const os = await request(base).post('/api/inventory/opening-stock').set(manager).send({
      warehouseId: whA, authority: 'system_entry',
      lines: [{ productId: productA, quantityBase: '5', unitCost: '20.00' }],
    });
    expect(os.status).toBe(201);
    // the adjustment document carries a synchronous journal — no backfill needed
    const adj = await fx.admin.query(
      `SELECT id FROM stock_adjustment WHERE tenant_id = $1 AND source_count_id = $2`,
      [fx.tenantA.tenantId, os.body.id],
    );
    expect(adj.rows).toHaveLength(1);
    const mv = await fx.admin.query(
      `SELECT id FROM stock_movement WHERE tenant_id = $1 AND source_document_type = 'stock_adjustment' AND source_document_id = $2`,
      [fx.tenantA.tenantId, adj.rows[0]!.id],
    );
    expect(mv.rows).toHaveLength(1);
    const j = await syncJournal(String(mv.rows[0]!.id));
    expect(j['inventory']).toEqual({ d: '100.0000', c: '0.0000' });
    expect(j['opening_balance_equity']).toEqual({ d: '0.0000', c: '100.0000' });
  });

  it('adjustment loss and gain post their purpose-mapped journals synchronously', async () => {
    // loss: −1 unit @ 20 → Dr shrinkage 20 / Cr inventory 20
    const loss = await request(base).post('/api/stock-adjustments').set(manager).send({
      warehouseId: whA, reason: 'damaged unit write-off (sync GL test)',
      lines: [{ productId: productA, quantityBase: '-1' }],
    });
    expect(loss.status).toBe(201);
    const lossMovements = await latestMovements(loss.body.id, 1);
    const lossJ = await syncJournal(lossMovements[0]!);
    expect(lossJ['inventory_adjustment_loss']).toEqual({ d: '20.0000', c: '0.0000' });
    expect(lossJ['inventory']).toEqual({ d: '0.0000', c: '20.0000' });

    // gain: +2 units @ 20 → Dr inventory 40 / Cr adjustment gains 40
    const gain = await request(base).post('/api/stock-adjustments').set(manager).send({
      warehouseId: whA, reason: 'found stock gain (sync GL test)',
      lines: [{ productId: productA, quantityBase: '2', unitCost: '20.00' }],
    });
    expect(gain.status).toBe(201);
    const gainMovements = await latestMovements(gain.body.id, 1);
    const gainJ = await syncJournal(gainMovements[0]!);
    expect(gainJ['inventory']).toEqual({ d: '40.0000', c: '0.0000' });
    expect(gainJ['inventory_adjustment_gain']).toEqual({ d: '0.0000', c: '40.0000' });

    // reversal of the LOSS mirrors the SAME counter account (never a gain)
    const rev = await request(base).post(`/api/stock-adjustments/${loss.body.id}/reverse`).set(manager).send({});
    expect(rev.status).toBe(201);
    const revMovements = await fx.admin.query(
      `SELECT id FROM stock_movement WHERE tenant_id = $1 AND source_document_type = 'stock_adjustment' AND source_document_id = $2`,
      [fx.tenantA.tenantId, rev.body.id],
    );
    const revJ = await syncJournal(String(revMovements.rows[0]!.id));
    expect(revJ['inventory']).toEqual({ d: '20.0000', c: '0.0000' });
    expect(revJ['inventory_adjustment_loss']).toEqual({ d: '0.0000', c: '20.0000' });
  });

  it('internal transfer: value moves inventory ↔ in-transit, ZERO P&L impact', async () => {
    const before = await fx.admin.query(
      `SELECT COALESCE(SUM(l.debit), 0)::text AS d FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = $1 AND m.purpose IN ('sales_revenue','inventory_adjustment_gain','inventory_adjustment_loss','cogs')`,
      [fx.tenantA.tenantId],
    );
    const trf = await request(base).post('/api/transfers').set(manager).send({
      fromWarehouseId: whA, toWarehouseId: whB,
      lines: [{ productId: productA, quantityBase: '3' }],
    });
    expect(trf.status).toBe(201);
    const dispatch = await request(base).post(`/api/transfers/${trf.body.id}/dispatch`).set(manager).send({});
    expect(dispatch.status).toBe(201);
    const receive = await request(base).post(`/api/transfers/${trf.body.id}/receive`).set(manager).send({
      lines: [{ productId: productA, quantityBase: '3' }],
    });
    expect(receive.status).toBe(201);

    const outMv = await fx.admin.query(
      `SELECT id FROM stock_movement WHERE tenant_id = $1 AND transfer_id = $2 AND movement_type = 'transfer_out'`,
      [fx.tenantA.tenantId, trf.body.id],
    );
    const inMv = await fx.admin.query(
      `SELECT id FROM stock_movement WHERE tenant_id = $1 AND transfer_id = $2 AND movement_type = 'transfer_in'`,
      [fx.tenantA.tenantId, trf.body.id],
    );
    const outJ = await syncJournal(String(outMv.rows[0]!.id));
    const inJ = await syncJournal(String(inMv.rows[0]!.id));
    // 3 × 20 = 60 carried value (AVCO of 6 remaining units @ 20)
    expect(outJ['inventory_in_transit']).toEqual({ d: '60.0000', c: '0.0000' });
    expect(outJ['inventory']).toEqual({ d: '0.0000', c: '60.0000' });
    expect(inJ['inventory']).toEqual({ d: '60.0000', c: '0.0000' });
    expect(inJ['inventory_in_transit']).toEqual({ d: '0.0000', c: '60.0000' });

    // in-transit control is back to zero and NO P&L account moved
    const inTransit = await fx.admin.query(
      `SELECT (COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0))::text AS bal
       FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = $1 AND m.purpose = 'inventory_in_transit'`,
      [fx.tenantA.tenantId],
    );
    expect(inTransit.rows[0]!.bal).toBe('0.0000');
    const after = await fx.admin.query(
      `SELECT COALESCE(SUM(l.debit), 0)::text AS d FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = $1 AND m.purpose IN ('sales_revenue','inventory_adjustment_gain','inventory_adjustment_loss','cogs')`,
      [fx.tenantA.tenantId],
    );
    expect(after.rows[0]!.d).toBe(before.rows[0]!.d);
  });

  it('backfill cannot double-post journals that were produced synchronously', async () => {
    const beforeCount = await fx.admin.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'stock_movement'`,
      [fx.tenantA.tenantId],
    );
    const run1 = await request(base).post('/api/accounting/backfill').set(owner).send({});
    expect(run1.status).toBe(201);
    expect(run1.body.nonSaleInventoryJournals).toBe(0); // everything is already posted
    const run2 = await request(base).post('/api/accounting/backfill').set(owner).send({});
    expect(run2.status).toBe(201);
    expect(run2.body.nonSaleInventoryJournals).toBe(0);
    const afterCount = await fx.admin.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'stock_movement'`,
      [fx.tenantA.tenantId],
    );
    expect(afterCount.rows[0]!.n).toBe(beforeCount.rows[0]!.n);
  });

  it('a CLOSED period blocks a new adjustment — full rollback across all five stores', async () => {
    // create + close the current month
    const created = await request(base).post('/api/accounting/periods').set(owner).send({
      fiscalYear: Number(YEAR), months: [Number(TODAY.slice(5, 7))],
    });
    expect(created.status).toBe(201);
    const periodId = created.body[0].id;
    const closed = await request(base)
      .post(`/api/accounting/periods/${periodId}/status`).set(owner).send({ status: 'closed' });
    expect(closed.status).toBe(201);

    const before = await counts();
    const blocked = await request(base).post('/api/stock-adjustments').set(manager).send({
      warehouseId: whA, reason: 'adjustment in a closed period must be blocked',
      lines: [{ productId: productA, quantityBase: '-1' }],
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/period covering .* is closed/i);

    const after = await counts();
    expect(after[0].rows[0]!.n).toBe(before[0].rows[0]!.n); // journals
    expect(after[1].rows[0]!.n).toBe(before[1].rows[0]!.n); // adjustment documents
    expect(after[2].rows[0]!.n).toBe(before[2].rows[0]!.n); // stock movements
    expect(after[3].rows[0]!.n).toBe(before[3].rows[0]!.n); // audit
    expect(after[4].rows[0]!.n).toBe(before[4].rows[0]!.n); // outbox
    expect(after[5].rows[0]!.q).toBe(before[5].rows[0]!.q); // stock balance
    expect(after[5].rows[0]!.v).toBe(before[5].rows[0]!.v); // cost state

    // reopen → the same posting succeeds WITH its journal
    const reopened = await request(base)
      .post(`/api/accounting/periods/${periodId}/status`).set(owner)
      .send({ status: 'open', reason: 'review test complete — reopen for operations' });
    expect(reopened.status).toBe(201);
    const ok = await request(base).post('/api/stock-adjustments').set(manager).send({
      warehouseId: whA, reason: 'adjustment after reopen (sync GL test)',
      lines: [{ productId: productA, quantityBase: '-1' }],
    });
    expect(ok.status).toBe(201);
    const okMovements = await latestMovements(ok.body.id, 1);
    const okJ = await syncJournal(okMovements[0]!);
    expect(okJ['inventory_adjustment_loss']).toBeDefined();
    // leave the period OPEN for the race test below
  });

  it('concurrent close/posting race: a close never slips under a passed check (deterministic)', async () => {
    const periodId = (
      await fx.admin.query(
        `SELECT id FROM accounting_period WHERE tenant_id = $1 AND $2::date BETWEEN starts_on AND ends_on`,
        [fx.tenantA.tenantId, TODAY],
      )
    ).rows[0]!.id as string;
    const lockKey = `accounting-period:${fx.tenantA.tenantId}:${periodId}`;

    try {
      // Hold the EXCLUSIVE period lock from outside the application, then
      // queue the CLOSE on the exclusive lock FIRST and the adjustment on
      // the shared lock SECOND. PostgreSQL grants advisory waiters in
      // queue order, so releasing the external lock deterministically lets
      // the CLOSE commit first; the poster then acquires the shared lock,
      // RE-READS the (now soft-closed) status and is rejected — a posting
      // can never commit into a period that closed concurrently.
      await fx.admin.query('BEGIN');
      await fx.admin.query(
        `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
        [lockKey],
      );
      const closePromise = request(base)
        .post(`/api/accounting/periods/${periodId}/status`).set(owner)
        .send({ status: 'soft_closed' });
      await new Promise((r) => setTimeout(r, 300)); // the close is queued on the exclusive lock
      const adjPromise = request(base).post('/api/stock-adjustments').set(manager).send({
        warehouseId: whA, reason: 'racing a concurrent period close (deterministic)',
        lines: [{ productId: productA, quantityBase: '-1' }],
      });
      await new Promise((r) => setTimeout(r, 300)); // the adjustment is queued behind it
      await fx.admin.query('ROLLBACK'); // release the external lock

      const [closeRes, adjRes] = await Promise.all([closePromise, adjPromise]);
      expect(closeRes.status).toBe(201); // the close serialized FIRST
      expect(adjRes.status).toBe(409);   // the poster re-read the closed status
      expect(adjRes.body.error).toMatch(/soft_closed/i);
      // no half-posted evidence anywhere
      const stray = await fx.admin.query(
        `SELECT count(*)::int AS n FROM stock_adjustment WHERE tenant_id = $1 AND reason LIKE 'racing a concurrent period close%'`,
        [fx.tenantA.tenantId],
      );
      expect(stray.rows[0]!.n).toBe(0);
    } finally {
      // restore open state for any later use — even on failure
      await request(base)
        .post(`/api/accounting/periods/${periodId}/status`).set(owner)
        .send({ status: 'open', reason: 'race test complete — normal operations' });
    }
  });

  it('deep rollback: a failure after receive writes leaves stock, cost, GL, audit and outbox untouched', async () => {
    const trf = await request(base).post('/api/transfers').set(manager).send({
      fromWarehouseId: whA, toWarehouseId: whB,
      lines: [{ productId: productA, quantityBase: '1' }],
    });
    expect(trf.status).toBe(201);
    // dispatch normally (its journals commit)…
    const dispatched = await request(base).post(`/api/transfers/${trf.body.id}/dispatch`).set(manager).send({});
    expect(dispatched.status).toBe(201);
    const dispatchJournals = await fx.admin.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'stock_movement'`,
      [fx.tenantA.tenantId],
    );
    // …then a receive that fails AFTER every participant write
    const before = await Promise.all([
      fx.admin.query(`SELECT quantity_base::text AS q FROM stock_balance WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`, [fx.tenantA.tenantId, whB, productA]),
      fx.admin.query(`SELECT quantity_base::text AS q, total_value::text AS v FROM stock_cost_state WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`, [fx.tenantA.tenantId, whB, productA]),
      Promise.resolve({ rows: dispatchJournals.rows }),
      fx.admin.query(`SELECT count(*)::int AS n FROM audit_event WHERE tenant_id = $1 AND action = 'transfer.received'`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT count(*)::int AS n FROM outbox_event WHERE tenant_id = $1 AND type = 'TransferReceived'`, [fx.tenantA.tenantId]),
    ]);
    const failed = await request(base).post(`/api/transfers/${trf.body.id}/receive`).set(manager).send({
      lines: [{ productId: productA, quantityBase: '1' }],
      simulateFailureAfterWrites: true,
    });
    expect(failed.status).toBe(500);
    const after = await Promise.all([
      fx.admin.query(`SELECT quantity_base::text AS q FROM stock_balance WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`, [fx.tenantA.tenantId, whB, productA]),
      fx.admin.query(`SELECT quantity_base::text AS q, total_value::text AS v FROM stock_cost_state WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`, [fx.tenantA.tenantId, whB, productA]),
      fx.admin.query(`SELECT count(*)::int AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'stock_movement'`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT count(*)::int AS n FROM audit_event WHERE tenant_id = $1 AND action = 'transfer.received'`, [fx.tenantA.tenantId]),
      fx.admin.query(`SELECT count(*)::int AS n FROM outbox_event WHERE tenant_id = $1 AND type = 'TransferReceived'`, [fx.tenantA.tenantId]),
    ]);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]!.rows, `store ${i} must be untouched`).toEqual(before[i]!.rows);
    }
    // sanity: the transfer stays in_transit with nothing received (nothing leaked)
    const t = await request(base).get(`/api/transfers/${trf.body.id}`).set(manager);
    expect(t.body.status).toBe('in_transit');
    expect(t.body.lines[0].receivedQuantityBase).toBe('0.000000');
  });
});

/* ================================================================== */
/* BLOCKER 4 — historical as-of correctness (timeline tests)          */
/* ================================================================== */
describe('Blocker 4: as-of reporting never sees future transactions', () => {
  let fx: ApiFixture;
  let base: string;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productT: string;
  let supplierS1: string;
  let customerC1: string;

  const OCT1 = `${YEAR}-10-01`;
  const OCT5 = `${YEAR}-10-05`;
  const OCT10 = `${YEAR}-10-10`;
  const OCT15 = `${YEAR}-10-15`;
  const OCT20 = `${YEAR}-10-20`;
  const OCT25 = `${YEAR}-10-25`;

  async function recon(asOf: string) {
    const res = await request(base)
      .get(`/api/accounting/reconciliation?asOf=${asOf}`).set(owner);
    expect(res.status).toBe(200);
    return new Map<string, { check: string; controlBalance: string; subledgerBalance: string; difference: string; passed: boolean; detail: string }>(
      (res.body.checks as Array<{ check: string; controlBalance: string; subledgerBalance: string; difference: string; passed: boolean; detail: string }>)
        .map((c) => [c.check, c]),
    );
  }
  async function aging(asOf: string) {
    const res = await request(base).get(`/api/ap/aging?asOf=${asOf}`).set(owner);
    if (res.status !== 200) {
      throw new Error(`aging ${asOf} → ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body as Array<{ supplierId: string; total: string }>;
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    base = await listenFixture(fx);
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    whA = (await request(base).post('/api/warehouses').set(owner).send({ code: 'TM-WH', name: 'TM WH' })).body.id;
    unitPc = (await request(base).post('/api/units').set(owner).send({ code: 'TM-PC', name: 'Pieces' })).body.id;
    productT = (
      await request(base).post('/api/products').set(owner).send({
        code: 'TM-P', name: 'TM P', baseUnitId: unitPc, sellingPrice: '40.00', purchasePrice: '20.00',
      })
    ).body.id;
    supplierS1 = (await request(base).post('/api/suppliers').set(owner).send({ name: 'TM Supplier', phone: '0204444444' })).body.id;
    customerC1 = (await request(base).post('/api/customers').set(owner).send({ name: 'TM Customer', phone: '0244444444' })).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('AP timeline: 100 on Oct 1, −60 on Oct 10, −40 on Oct 20 → 100 / 40 / 0', async () => {
    // Oct 1: GRN + invoice 100 (5 × 20)
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: supplierS1, warehouseId: whA, businessDate: OCT1,
      lines: [{ productId: productT, receivedQuantity: '5', unitCost: '20.00' }],
    });
    expect(grn.status).toBe(201);
    const inv = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId: supplierS1, supplierInvoiceNumber: 'TM-INV-1', supplierInvoiceDate: OCT1,
      dueDate: OCT20, businessDate: OCT1, post: true,
      lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productT, description: 'timeline purchase', quantityBase: '5', unitPrice: '20.00' }],
    });
    expect(inv.status).toBe(201);
    expect(inv.body.total).toBe('100.0000');

    // as of Oct 5: full 100 on BOTH sides
    let r = await recon(OCT5);
    expect(r.get('accounts_payable')!.controlBalance).toBe('100.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('100.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
    expect((await aging(OCT5)).find((a) => a.supplierId === supplierS1)!.total).toBe('100.0000');

    // Oct 10: allocation of 60
    const pay1 = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: OCT10, amount: '60.00', method: 'cash',
      allocations: [{ supplierInvoiceId: inv.body.id, amount: '60.0000' }],
    });
    expect(pay1.status).toBe(201);
    r = await recon(OCT5); // history is UNCHANGED
    expect(r.get('accounts_payable')!.controlBalance).toBe('100.0000');
    r = await recon(OCT15);
    expect(r.get('accounts_payable')!.controlBalance).toBe('40.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('40.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
    expect((await aging(OCT15)).find((a) => a.supplierId === supplierS1)!.total).toBe('40.0000');

    // Oct 20: the remaining 40
    const pay2 = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: OCT20, amount: '40.00', method: 'cash',
      allocations: [{ supplierInvoiceId: inv.body.id, amount: '40.0000' }],
    });
    expect(pay2.status).toBe(201);
    r = await recon(OCT15); // still 40 as of Oct 15
    expect(r.get('accounts_payable')!.controlBalance).toBe('40.0000');
    r = await recon(OCT25);
    expect(r.get('accounts_payable')!.controlBalance).toBe('0.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('0.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
    expect((await aging(OCT25)).find((a) => a.supplierId === supplierS1)).toBeUndefined();
  });

  it('customer deposit timeline: future credit applications cannot leak backwards', async () => {
    // stock for the October sale (GRN backdated to Oct 1)
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: supplierS1, warehouseId: whA, businessDate: OCT1,
      lines: [{ productId: productT, receivedQuantity: '6', unitCost: '20.00' }],
    });
    expect(grn.status).toBe(201);

    // deposit received Oct 1: document + payment + GL journal backdated
    // TOGETHER (one consistent piece of October evidence)
    const dep = await request(base).post('/api/deposits').set(manager).send({
      customerId: customerC1, amount: '200.00', tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(dep.status).toBe(201);
    await fx.admin.query(`UPDATE customer_deposit SET business_date = $2 WHERE id = $1`, [dep.body.id, OCT1]);
    await fx.admin.query(
      `UPDATE payment SET business_date = $2 WHERE id = (SELECT payment_id FROM customer_deposit WHERE id = $1)`,
      [dep.body.id, OCT1],
    );
    await fx.admin.query(
      `UPDATE journal_entry SET business_date = $2
       WHERE tenant_id = $3 AND source_kind = 'customer_deposit' AND source_id = $1`,
      [dep.body.id, OCT1, fx.tenantA.tenantId],
    );

    // sale on AR dated Oct 1 (invoice + journal + stock movements backdated
    // together — one consistent piece of October evidence)
    const sale = await request(base).post('/api/sales/commit').set(manager).send({
      warehouseId: whA, customerId: customerC1,
      lines: [{ productId: productT, quantityBase: '6', unitPrice: '40.00' }],
      tenders: [],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;
    await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [invoiceId, OCT1]);
    await fx.admin.query(
      `UPDATE journal_entry SET business_date = $2
       WHERE tenant_id = $3 AND source_kind = 'invoice' AND source_id = $1`,
      [invoiceId, OCT1, fx.tenantA.tenantId],
    );
    await fx.admin.query(
      `UPDATE stock_movement SET occurred_at = $2::timestamptz
       WHERE tenant_id = $3 AND source_document_type = 'invoice' AND source_document_id = $1`,
      [invoiceId, `${OCT1} 10:00:00`, fx.tenantA.tenantId],
    );

    // as of Oct 5: the full 200 deposit (both sides)
    let r = await recon(OCT5);
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('200.0000');
    expect(r.get('customer_deposit_liability')!.subledgerBalance).toBe('200.0000');
    expect(r.get('customer_deposit_liability')!.passed).toBe(true);

    // Oct 10: 150 of the deposit is applied to the invoice (application row
    // and its credit_applied journal backdated to the true date)
    const apply = await request(base).post('/api/credits/apply').set(manager).send({
      depositId: dep.body.id, invoiceId, amount: '150.0000',
    });
    expect(apply.status).toBe(201);
    await fx.admin.query(`UPDATE credit_application SET created_at = $2::timestamptz WHERE id = $1`, [apply.body.id, `${OCT10} 10:00:00`]);
    await fx.admin.query(
      `UPDATE journal_entry SET business_date = $2
       WHERE tenant_id = $3 AND source_kind = 'credit_application' AND source_id = $1`,
      [apply.body.id, OCT10, fx.tenantA.tenantId],
    );

    r = await recon(OCT5); // history unchanged by the Oct-10 application
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('200.0000');
    expect(r.get('customer_deposit_liability')!.subledgerBalance).toBe('200.0000');
    r = await recon(OCT15); // 150 consumed by Oct 10
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('50.0000');
    expect(r.get('customer_deposit_liability')!.subledgerBalance).toBe('50.0000');
    expect(r.get('customer_deposit_liability')!.passed).toBe(true);
    // AR timeline is equally exact: 240 (Oct 1) → 90 (after the Oct-10 application)
    expect(r.get('accounts_receivable')!.controlBalance).toBe('90.0000');
    expect(r.get('accounts_receivable')!.subledgerBalance).toBe('90.0000');
    r = await recon(OCT25); // stable afterwards
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('50.0000');
  });

  it('supplier advance timeline: applications take effect from their journal date only', async () => {
    // Oct 1: invoice 40 (2 × 20), then an advance payment 80 on Oct 1
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: supplierS1, warehouseId: whA, businessDate: OCT1,
      lines: [{ productId: productT, receivedQuantity: '2', unitCost: '20.00' }],
    });
    expect(grn.status).toBe(201);
    const inv = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId: supplierS1, supplierInvoiceNumber: 'TM-INV-ADV', supplierInvoiceDate: OCT1,
      businessDate: OCT1, post: true,
      lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productT, description: 'advance timeline purchase', quantityBase: '2', unitPrice: '20.00' }],
    });
    expect(inv.status).toBe(201);
    const adv = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: OCT1, amount: '80.00', method: 'cash', allocations: [],
    });
    expect(adv.status).toBe(201);

    // as of Oct 5: AP = TM-INV-1 (100, still open before Oct 10) + TM-INV-ADV 40;
    // advance 80 (both reconcile)
    let r = await recon(OCT5);
    expect(r.get('accounts_payable')!.controlBalance).toBe('140.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('140.0000');
    expect(r.get('supplier_advance')!.controlBalance).toBe('80.0000');
    expect(r.get('supplier_advance')!.subledgerBalance).toBe('80.0000');

    // application of 40 books at the PAYMENT's business date (Oct 1)
    const apply = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.body.id, allocations: [{ supplierInvoiceId: inv.body.id, amount: '40.0000' }],
    });
    expect(apply.status).toBe(201);
    r = await recon(OCT5);
    expect(r.get('supplier_advance')!.controlBalance).toBe('40.0000'); // 80 − 40 applied
    expect(r.get('accounts_payable')!.controlBalance).toBe('100.0000'); // only TM-INV-1 remains
    expect(r.get('supplier_advance')!.passed).toBe(true);

    // Oct 20: second invoice 40 (not applied) — visible only from Oct 20 on
    const grn2 = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: supplierS1, warehouseId: whA, businessDate: OCT20,
      lines: [{ productId: productT, receivedQuantity: '2', unitCost: '20.00' }],
    });
    expect(grn2.status).toBe(201);
    const inv2 = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId: supplierS1, supplierInvoiceNumber: 'TM-INV-2', supplierInvoiceDate: OCT20,
      businessDate: OCT20, post: true,
      lines: [{ goodsReceiptLineId: grn2.body.lines[0].id, productId: productT, description: 'timeline purchase 2', quantityBase: '2', unitPrice: '20.00' }],
    });
    expect(inv2.status).toBe(201);
    r = await recon(OCT15);
    expect(r.get('accounts_payable')!.controlBalance).toBe('40.0000'); // TM-INV-1 (paid 60 on Oct 10); future invoice invisible
    r = await recon(OCT25);
    expect(r.get('accounts_payable')!.controlBalance).toBe('40.0000'); // TM-INV-1 settled; TM-INV-2 open
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('40.0000');
    expect(r.get('supplier_advance')!.controlBalance).toBe('40.0000'); // 80 − 40 stays unapplied

    // chronology guard: an advance may NEVER be applied to an invoice dated
    // after the payment — the application would predate the invoice
    const refused = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.body.id, allocations: [{ supplierInvoiceId: inv2.body.id, amount: '1.0000' }],
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/before invoice|predates/i);
  });

  it('COGS timeline: GL and stock ledger are cut at the SAME as-of date', async () => {
    const SEP30 = `${YEAR}-09-30`; // before any October activity
    const before = await recon(SEP30);
    expect(before.get('cogs_vs_stock_ledger')!.controlBalance).toBe('0.0000');
    expect(before.get('cogs_vs_stock_ledger')!.subledgerBalance).toBe('0.0000');
    expect(before.get('cogs_vs_stock_ledger')!.passed).toBe(true);

    // a cash sale today (stock exists from the Oct GRNs)
    const sale = await request(base).post('/api/sales/commit').set(manager).send({
      warehouseId: whA, customerId: customerC1,
      lines: [{ productId: productT, quantityBase: '1', unitPrice: '40.00' }],
      tenders: [{ method: 'cash', amount: '40.00' }],
    });
    expect(sale.status).toBe(201);
    void sale.body.invoice.costTotal; // COGS asserted cumulatively below

    const after = await recon(TOMORROW);
    // cumulative COGS of BOTH today's sales (6 × 20 from the deposit-timeline
    // sale + 1 × 20 here) — GL and ledger cut at the SAME date, exactly equal
    expect(after.get('cogs_vs_stock_ledger')!.controlBalance).toBe('140.0000');
    expect(after.get('cogs_vs_stock_ledger')!.subledgerBalance).toBe('140.0000');
    expect(after.get('cogs_vs_stock_ledger')!.passed).toBe(true);
    // as of YESTERDAY both sides are still exactly the October sale's COGS
    // (the future sale is invisible) and they remain EQUAL
    expect((await recon(YESTERDAY)).get('cogs_vs_stock_ledger')!.controlBalance).toBe(
      (await recon(YESTERDAY)).get('cogs_vs_stock_ledger')!.subledgerBalance,
    );
  });
});

/* ================================================================== */
/* BLOCKER 5 — supplier statement chronology (no double-counting)     */
/* ================================================================== */
describe('Blocker 5: supplier statement presents every document exactly once', () => {
  let fx: ApiFixture;
  let base: string;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productS: string;
  let supplierS1: string;
  let stInvoiceId = '';

  const D1 = `${YEAR}-10-01`; // invoice 100
  const D2 = `${YEAR}-10-05`; // payment 40
  const D3 = `${YEAR}-10-08`; // debit note 10
  const D4 = `${YEAR}-10-12`; // credit note 20
  const D5 = `${YEAR}-10-15`; // payment 30
  const D6 = `${YEAR}-10-18`; // advance 50 (unapplied)
  const D7 = `${YEAR}-10-20`; // advance application 20
  const D8 = `${YEAR}-10-25`; // after everything

  async function statement(asOf: string) {
    const res = await request(base)
      .get(`/api/ap/statements/${supplierS1}?asOf=${asOf}`).set(owner);
    expect(res.status).toBe(200);
    return res.body as {
      lines: Array<{ businessDate: string; documentCode: string; documentType: string; debit: string; credit: string; runningOpen: string }>;
      closingBalance: string;
      advanceBalance: string;
    };
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    base = await listenFixture(fx);
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    whA = (await request(base).post('/api/warehouses').set(owner).send({ code: 'ST-WH', name: 'ST WH' })).body.id;
    unitPc = (await request(base).post('/api/units').set(owner).send({ code: 'ST-PC', name: 'Pieces' })).body.id;
    productS = (
      await request(base).post('/api/products').set(owner).send({
        code: 'ST-P', name: 'ST P', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '25.00',
      })
    ).body.id;
    supplierS1 = (await request(base).post('/api/suppliers').set(owner).send({ name: 'ST Supplier', phone: '0205555555' })).body.id;

    // Oct 1: invoice 100 (4 × 25)
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: supplierS1, warehouseId: whA, businessDate: D1,
      lines: [{ productId: productS, receivedQuantity: '4', unitCost: '25.00' }],
    });
    expect(grn.status).toBe(201);
    const inv = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId: supplierS1, supplierInvoiceNumber: 'ST-INV-1', supplierInvoiceDate: D1,
      dueDate: D8, businessDate: D1, post: true,
      lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productS, description: 'statement purchase', quantityBase: '4', unitPrice: '25.00' }],
    });
    expect(inv.status).toBe(201);
    stInvoiceId = inv.body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  const invId = () => stInvoiceId;

  it('statement before and after the invoice: the invoice appears ONCE at its own value', async () => {
    const before = await statement(`${YEAR}-09-30`);
    expect(before.lines).toHaveLength(0);
    expect(before.closingBalance).toBe('0.0000');

    const after = await statement(D1);
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0]).toMatchObject({ documentType: 'supplier_invoice', debit: '100.0000', credit: '0.0000' });
    expect(after.lines[0]!.runningOpen).toBe('100.0000');
    expect(after.closingBalance).toBe('100.0000');
  });

  it('partial payment, debit note, credit note, second payment: one row each on their own dates', async () => {
    // Oct 5: payment 40
    const pay1 = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: D2, amount: '40.00', method: 'cash',
      allocations: [{ supplierInvoiceId: invId(), amount: '40.0000' }],
    });
    expect(pay1.status).toBe(201);

    let s = await statement(D2);
    expect(s.lines.map((l) => l.documentType)).toEqual(['supplier_invoice', 'supplier_payment']);
    expect(s.closingBalance).toBe('60.0000');

    // Oct 8: debit note 10
    const dn = await request(base).post('/api/purchasing/supplier-adjustments').set(manager).send({
      kind: 'debit_note', supplierId: supplierS1, supplierInvoiceId: invId(), businessDate: D3,
      reason: 'freight surcharge (statement test)', adjustmentClass: 'price_correction', amount: '10.0000',
    });
    expect(dn.status).toBe(201);
    s = await statement(D3);
    expect(s.lines.map((l) => l.documentType)).toEqual(['supplier_invoice', 'supplier_payment', 'supplier_adjustment']);
    expect(s.lines[2]).toMatchObject({ debit: '10.0000', credit: '0.0000' });
    expect(s.closingBalance).toBe('70.0000');

    // Oct 12: credit note 20
    const cn = await request(base).post('/api/purchasing/supplier-adjustments').set(manager).send({
      kind: 'credit_note', supplierId: supplierS1, supplierInvoiceId: invId(), businessDate: D4,
      reason: 'price correction (statement test)', adjustmentClass: 'price_correction', amount: '20.0000',
    });
    expect(cn.status).toBe(201);
    s = await statement(D4);
    expect(s.lines.map((l) => l.documentType)).toEqual(['supplier_invoice', 'supplier_payment', 'supplier_adjustment', 'supplier_adjustment']);
    // the note rows carry their OWN amounts — the invoice row is still exactly 100
    expect(s.lines[0]!.debit).toBe('100.0000');
    expect(s.lines[2]!.debit).toBe('10.0000');
    expect(s.lines[3]!.credit).toBe('20.0000');
    expect(s.closingBalance).toBe('50.0000');

    // Oct 15: second payment 30
    const pay2 = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: D5, amount: '30.00', method: 'cash',
      allocations: [{ supplierInvoiceId: invId(), amount: '30.0000' }],
    });
    expect(pay2.status).toBe(201);
    s = await statement(D5);
    expect(s.closingBalance).toBe('20.0000');
  });

  it('supplier advance: shown SEPARATELY (advanceBalance), applied on its own date', async () => {
    // Oct 18: advance 50 (unapplied)
    const adv = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId: supplierS1, businessDate: D6, amount: '50.00', method: 'cash', allocations: [],
    });
    expect(adv.status).toBe(201);
    let s = await statement(D6);
    // three payment rows exist (pay1, pay2, advance) — the ADVANCE is the one
    // with no allocated credit, and it must NOT reduce the running AP
    const advRows = s.lines.filter((l) => l.documentType === 'supplier_payment' && l.credit === '0.0000');
    expect(advRows).toHaveLength(1);
    expect(advRows[0]!.businessDate).toBe(D6);
    expect(s.closingBalance).toBe('20.0000');
    expect(s.advanceBalance).toBe('50.0000');

    // Oct 20: apply 20 of the advance to the invoice
    const apply = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.body.id, allocations: [{ supplierInvoiceId: invId(), amount: '20.0000' }],
    });
    expect(apply.status).toBe(201);
    s = await statement(D7);
    expect(s.closingBalance).toBe('0.0000'); // 20 AP settled by the advance application
    expect(s.advanceBalance).toBe('30.0000'); // 50 − 20 remains unapplied

    s = await statement(D8);
    expect(s.closingBalance).toBe('0.0000');
    expect(s.advanceBalance).toBe('30.0000');
  });

  it('closing AP position reconciles with the canonical AP equation AND the normalized GL control', async () => {
    const s = await statement(D8);
    // canonical: 100 + 10 − 20 − 40 − 30 − 20 = 0
    expect(s.closingBalance).toBe('0.0000');
    const r = await request(base)
      .get(`/api/accounting/reconciliation?asOf=${D8}`).set(owner);
    const ap = (r.body.checks as Array<{ check: string; controlBalance: string; subledgerBalance: string; passed: boolean }>)
      .find((c) => c.check === 'accounts_payable')!;
    expect(ap.controlBalance).toBe(s.closingBalance);
    expect(ap.subledgerBalance).toBe(s.closingBalance);
    expect(ap.passed).toBe(true);
    // advances are represented separately: GL supplier_advance control == advanceBalance
    const advCheck = (r.body.checks as Array<{ check: string; controlBalance: string }>)
      .find((c) => c.check === 'supplier_advance')!;
    expect(advCheck.controlBalance).toBe(s.advanceBalance);
  });
});
