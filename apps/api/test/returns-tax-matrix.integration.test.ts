/**
 * Returns tax matrix — independent review 5834590343, correction #1.
 *
 * REAL PostgreSQL coverage for full, partial and CUMULATIVE returns
 * against invoices carrying EXCLUSIVE, INCLUSIVE and MIXED tax
 * profiles. The financial invariant under test:
 *
 *   entitlement   = credited gross-net slice + EXCLUSIVE tax share only
 *                   (inclusive tax already lives inside the charged
 *                   prices — adding it again refunds money twice)
 *   contra-revenue = credited gross-net slice − INCLUSIVE tax share
 *   identity      total == net_revenue_reversal + tax_reversal_total
 *   journal       Dr(revenue + tax) == Cr(AR + refund + store credit)
 *
 * Scenario money (exact, half-even at 4dp):
 *   EXCL  VAT 10%          : 4 × 100 → net 400, VAT 40, total 440
 *   INCL  GETFUND 10%      : 4 × 110 → gross 440, net 400, tax 40 (inside)
 *   MIX   LEVY 5% + VAT 7.5%: 3 × 77 → gross 231, net 220, levy 11
 *                            (inside), VAT 16.5 (on top), total 247.50
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('returns tax matrix: inclusive, exclusive and mixed treatments', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let wh: string;
  let px: string; // sells 100.00 — exclusive scenarios
  let pi: string; // sells 110.00 — inclusive scenarios
  let pm: string; // sells 77.00 — mixed scenarios
  let customer: string;
  const today = new Date().toISOString().slice(0, 10);

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ---- helpers -------------------------------------------------------

  async function setDefaultProfile(code: string) {
    await fx.admin.query(`UPDATE tax_profile SET is_default = false WHERE tenant_id = $1`, [fx.tenantA.tenantId]);
    const r = await fx.admin.query(
      `UPDATE tax_profile SET is_default = true WHERE tenant_id = $1 AND code = $2 RETURNING id`,
      [fx.tenantA.tenantId, code],
    );
    expect(r.rowCount, `default profile ${code}`).toBe(1);
  }

  async function commitSale(productId: string, units: string, unitPrice: string, tenderAmount: string | null) {
    const body: Record<string, unknown> = {
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId, quantityBase: units, unitPrice }],
      ...(tenderAmount != null ? { tenders: [{ method: 'cash', amount: tenderAmount }] } : {}),
    };
    const res = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.invoice as {
      id: string;
      total: string;
      taxTotal: string;
      taxInclusive: boolean;
      lines: Array<{ id: string }>;
    };
  }

  /** create → (auto-approve) → receive → process; returns the processed body. */
  async function processReturn(
    invoiceId: string,
    invoiceLineId: string,
    qty: string,
    note: string,
  ) {
    const created = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId,
      reasonCode: 'TAX_MATRIX',
      creditDisposition: 'refund',
      customerNote: note,
      clientDocId: `taxmatrix-${note}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      lines: [{ invoiceLineId, quantity: qty, condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.status).toBe('approved');
    const received = await request(app.getHttpServer())
      .post(`/api/returns/${created.body.id}/receive`)
      .set(owner)
      .send({});
    expect(received.status, JSON.stringify(received.body)).toBe(201);
    const processed = await request(app.getHttpServer())
      .post(`/api/returns/${created.body.id}/process`)
      .set(owner)
      .send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);
    return processed.body as {
      id: string;
      grossCredit: string;
      arAmount: string;
      refundAmount: string;
      storeCreditAmount: string;
      cogsReversal: string;
      creditNoteId: string;
    };
  }

  async function creditNoteRow(cnId: string) {
    const r = await fx.admin.query(
      `SELECT total::text, credited_net::text, net_revenue_reversal::text, tax_reversal_total::text,
              ar_amount::text, refund_amount::text, store_credit_amount::text, cogs_reversal::text
         FROM credit_note WHERE id = $1`,
      [cnId],
    );
    expect(r.rows.length).toBe(1);
    return r.rows[0] as Record<string, string>;
  }

  async function creditNoteComponents(cnId: string) {
    const r = await fx.admin.query(
      `SELECT component_name, inclusive, taxable_basis::text, tax_amount::text
         FROM credit_note_tax_component WHERE credit_note_id = $1 ORDER BY component_name`,
      [cnId],
    );
    return r.rows as Array<{ component_name: string; inclusive: boolean; taxable_basis: string; tax_amount: string }>;
  }

  async function journalByAccount(sourceKind: string, sourceId: string) {
    const r = await fx.admin.query(
      `SELECT a.code AS account, jl.debit::text AS debit, jl.credit::text AS credit
         FROM journal_entry je
         JOIN journal_line jl ON jl.entry_id = je.id
         JOIN gl_account a ON a.id = jl.account_id
        WHERE je.source_kind = $1 AND je.source_id = $2
        ORDER BY a.code`,
      [sourceKind, sourceId],
    );
    return r.rows as Array<{ account: string; debit: string; credit: string }>;
  }

  function assertBalanced(lines: Array<{ account: string; debit: string; credit: string }>) {
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr, `journal debits ${dr} != credits ${cr}: ${JSON.stringify(lines)}`).toBe(cr);
    return { dr, cr };
  }

  // ---- fixture -------------------------------------------------------

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);

    wh = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'TX-WH', name: 'Tax Matrix WH' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'TX-PC', name: 'Tax Matrix Pieces' })).body.id;
    const mkProduct = async (code: string, price: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/products')
          .set(owner)
          .send({ code, name: `Tax Matrix ${code}`, baseUnitId: unit, sellingPrice: price, purchasePrice: '60.00' })
      ).body.id as string;
    px = await mkProduct('TX-PX', '100.00');
    pi = await mkProduct('TX-PI', '110.00');
    pm = await mkProduct('TX-PM', '77.00');
    customer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'Tax Matrix Customer', phone: '0244000777' })).body.id;

    const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'TAX_MATRIX',
      name: 'Tax matrix return',
      requiresApproval: false,
      refundPermitted: true,
      replacementPermitted: false,
      storeCreditPermitted: true,
      restockPermitted: true,
    });
    expect(reason.status).toBe(201);
    // auto-approve any amount for the requiresApproval=false reason
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 1000000)
       ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 1000000`,
      [fx.tenantA.tenantId],
    );

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh,
      authority: 'physical_count',
      businessDate: today,
      lines: [
        { productId: px, quantityBase: '500', unitCost: '60.00' },
        { productId: pi, quantityBase: '500', unitCost: '60.00' },
        { productId: pm, quantityBase: '500', unitCost: '60.00' },
      ],
    });
    expect(opening.status).toBe(201);

    // three tax profiles (transaction-time evidence per sale)
    const mkProfile = async (code: string, components: Array<{ name: string; rate: string; inclusive: boolean; seq: number }>) => {
      const p = await request(app.getHttpServer()).post('/api/tax/profiles').set(owner).send({ code, name: `Matrix ${code}` });
      expect(p.status, JSON.stringify(p.body)).toBe(201);
      const v = await request(app.getHttpServer()).post(`/api/tax/profiles/${p.body.id}/versions`).set(owner).send({
        effectiveFrom: '2000-01-01',
        components,
      });
      expect(v.status, JSON.stringify(v.body)).toBe(201);
    };
    await mkProfile('MX-EXCL', [{ name: 'VAT', rate: '0.100000', inclusive: false, seq: 1 }]);
    await mkProfile('MX-INCL', [{ name: 'GETFUND', rate: '0.100000', inclusive: true, seq: 1 }]);
    await mkProfile('MX-MIX', [
      { name: 'LEVY', rate: '0.050000', inclusive: true, seq: 1 },
      { name: 'VAT', rate: '0.075000', inclusive: false, seq: 2 },
    ]);
  });

  afterAll(async () => {
    await fx?.close();
  });

  // ---- EXCLUSIVE ------------------------------------------------------

  it('exclusive tax, full return: entitlement = net + tax, journal balances, refund posts', async () => {
    await setDefaultProfile('MX-EXCL');
    const inv = await commitSale(px, '4', '100.00', '440.00');
    expect(inv.total).toBe('440.0000');
    expect(inv.taxTotal).toBe('40.0000');
    expect(inv.taxInclusive).toBe(false);

    const ret = await processReturn(inv.id, inv.lines[0]!.id, '4', 'exclusive full');
    // entitlement 400 net + 40 VAT — NOT re-adding anything
    expect(ret.grossCredit).toBe('440.0000');
    expect(ret.refundAmount).toBe('440.0000'); // fully paid invoice → refund payable
    expect(ret.arAmount).toBe('0.0000');
    expect(ret.storeCreditAmount).toBe('0.0000');
    expect(ret.cogsReversal).toBe('240.0000'); // 4 × 60 original cost

    const cn = await creditNoteRow(ret.creditNoteId);
    expect(cn.total).toBe('440.0000');
    expect(cn.credited_net).toBe('400.0000');
    expect(cn.net_revenue_reversal).toBe('400.0000'); // exclusive tax never sat in revenue
    expect(cn.tax_reversal_total).toBe('40.0000');
    expect(cn.refund_amount).toBe('440.0000');

    const comps = await creditNoteComponents(ret.creditNoteId);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.component_name).toBe('VAT');
    expect(comps[0]!.inclusive).toBe(false);
    expect(comps[0]!.tax_amount).toBe('40.0000');
    expect(comps[0]!.taxable_basis).toBe('400.0000'); // net basis, like the invoice evidence

    // journal: Dr revenue 400, Dr tax 40, Dr inventory 240 / Cr cogs 240, Cr refunds 440
    const lines = await journalByAccount('credit_note', ret.creditNoteId);
    const byAccount = new Map(lines.map((l) => [l.account, l]));
    expect(byAccount.get('4000')!.debit).toBe('400.0000');
    expect(byAccount.get('2200')!.debit).toBe('40.0000');
    expect(byAccount.get('1200')!.debit).toBe('240.0000');
    expect(byAccount.get('5000')!.credit).toBe('240.0000');
    expect(byAccount.get('2150')!.credit).toBe('440.0000');
    const { dr } = assertBalanced(lines);
    expect(dr).toBe(680);

    // refund the money out: Dr refunds payable 440 / Cr cash 440
    const refund = await request(app.getHttpServer()).post('/api/returns/refunds').set(owner).send({
      creditNoteId: ret.creditNoteId, amount: '440.00', method: 'cash', approveAndPost: true,
    });
    expect(refund.status, JSON.stringify(refund.body)).toBe(201);
    expect(refund.body.status).toBe('settled');
    const rLines = await journalByAccount('refund', refund.body.id);
    expect(rLines.find((l) => l.account === '2150')!.debit).toBe('440.0000');
    expect(rLines.find((l) => l.account === '1000')!.credit).toBe('440.0000');
    assertBalanced(rLines);
  });

  it('exclusive tax, cumulative partial returns: slices sum EXACTLY to the posted figures', async () => {
    await setDefaultProfile('MX-EXCL');
    const inv = await commitSale(px, '4', '100.00', '440.00');
    const lineId = inv.lines[0]!.id;

    const r1 = await processReturn(inv.id, lineId, '1', 'exclusive partial 1');
    expect(r1.grossCredit).toBe('110.0000'); // 100 net + 10 VAT
    expect(r1.refundAmount).toBe('110.0000');

    const r2 = await processReturn(inv.id, lineId, '2', 'exclusive partial 2');
    expect(r2.grossCredit).toBe('220.0000'); // 200 net + 20 VAT

    const r3 = await processReturn(inv.id, lineId, '1', 'exclusive partial 3');
    expect(r3.grossCredit).toBe('110.0000');

    // cumulative caps: Σ credited net == 400, Σ tax == 40, Σ entitlement == 440
    const sums = await fx.admin.query(
      `SELECT COALESCE(SUM(credited_net),0)::text AS net, COALESCE(SUM(tax_reversal_total),0)::text AS tax,
              COALESCE(SUM(total),0)::text AS total, COALESCE(SUM(net_revenue_reversal),0)::text AS nrr
         FROM credit_note WHERE invoice_id = $1`,
      [inv.id],
    );
    expect(sums.rows[0]!.net).toBe('400.0000');
    expect(sums.rows[0]!.tax).toBe('40.0000');
    expect(sums.rows[0]!.total).toBe('440.0000');
    expect(sums.rows[0]!.nrr).toBe('400.0000');
    for (const cnId of [r1.creditNoteId, r2.creditNoteId, r3.creditNoteId]) {
      assertBalanced(await journalByAccount('credit_note', cnId));
    }
  });

  // ---- INCLUSIVE ------------------------------------------------------

  it('inclusive tax, full return: the embedded tax is NEVER added to the entitlement twice', async () => {
    await setDefaultProfile('MX-INCL');
    const inv = await commitSale(pi, '4', '110.00', '440.00');
    // charged 440 gross; net 400 lives inside; tax 40 extracted, total stays 440
    expect(inv.total).toBe('440.0000');
    expect(inv.taxTotal).toBe('40.0000');
    expect(inv.taxInclusive).toBe(true);

    const ret = await processReturn(inv.id, inv.lines[0]!.id, '4', 'inclusive full');
    // THE review defect: entitlement must be 440 (the gross), never
    // 440 + 40 = 480 — the inclusive tax is already inside the credit
    expect(ret.grossCredit).toBe('440.0000');
    expect(ret.refundAmount).toBe('440.0000');
    expect(ret.cogsReversal).toBe('240.0000');

    const cn = await creditNoteRow(ret.creditNoteId);
    expect(cn.total).toBe('440.0000');
    expect(cn.credited_net).toBe('440.0000'); // the gross axis slice
    expect(cn.net_revenue_reversal).toBe('400.0000'); // tax stripped OUT of revenue
    expect(cn.tax_reversal_total).toBe('40.0000');

    const comps = await creditNoteComponents(ret.creditNoteId);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.component_name).toBe('GETFUND');
    expect(comps[0]!.inclusive).toBe(true);
    expect(comps[0]!.tax_amount).toBe('40.0000');
    expect(comps[0]!.taxable_basis).toBe('440.0000'); // gross basis, like the invoice evidence

    // journal: Dr revenue 400, Dr tax 40, Dr inventory 240 / Cr cogs 240, Cr refunds 440
    const lines = await journalByAccount('credit_note', ret.creditNoteId);
    const byAccount = new Map(lines.map((l) => [l.account, l]));
    expect(byAccount.get('4000')!.debit).toBe('400.0000');
    expect(byAccount.get('2200')!.debit).toBe('40.0000');
    expect(byAccount.get('1200')!.debit).toBe('240.0000');
    expect(byAccount.get('5000')!.credit).toBe('240.0000');
    expect(byAccount.get('2150')!.credit).toBe('440.0000');
    assertBalanced(lines);
  });

  it('inclusive tax, cumulative partials against an UNPAID invoice: AR settled first, caps close exactly', async () => {
    await setDefaultProfile('MX-INCL');
    const inv = await commitSale(pi, '4', '110.00', null); // credit sale, no tenders
    const lineId = inv.lines[0]!.id;

    const r1 = await processReturn(inv.id, lineId, '1', 'inclusive ar partial 1');
    expect(r1.grossCredit).toBe('110.0000'); // gross slice — no tax added
    expect(r1.arAmount).toBe('110.0000'); // AR settled first
    expect(r1.refundAmount).toBe('0.0000');

    const r2 = await processReturn(inv.id, lineId, '2', 'inclusive ar partial 2');
    expect(r2.grossCredit).toBe('220.0000');
    expect(r2.arAmount).toBe('220.0000');
    expect(r2.refundAmount).toBe('0.0000');

    const r3 = await processReturn(inv.id, lineId, '1', 'inclusive ar partial 3');
    expect(r3.grossCredit).toBe('110.0000');
    expect(r3.arAmount).toBe('110.0000');

    // cumulative: Σ net revenue reversal == 400, Σ tax == 40, Σ AR == 440
    const sums = await fx.admin.query(
      `SELECT COALESCE(SUM(credited_net),0)::text AS net, COALESCE(SUM(tax_reversal_total),0)::text AS tax,
              COALESCE(SUM(total),0)::text AS total, COALESCE(SUM(net_revenue_reversal),0)::text AS nrr,
              COALESCE(SUM(ar_amount),0)::text AS ar, COALESCE(SUM(refund_amount),0)::text AS refund
         FROM credit_note WHERE invoice_id = $1`,
      [inv.id],
    );
    expect(sums.rows[0]!.net).toBe('440.0000');
    expect(sums.rows[0]!.tax).toBe('40.0000');
    expect(sums.rows[0]!.total).toBe('440.0000');
    expect(sums.rows[0]!.nrr).toBe('400.0000');
    expect(sums.rows[0]!.ar).toBe('440.0000'); // the whole receivable cleared by credit notes
    expect(sums.rows[0]!.refund).toBe('0.0000');
    for (const cnId of [r1.creditNoteId, r2.creditNoteId, r3.creditNoteId]) {
      assertBalanced(await journalByAccount('credit_note', cnId));
    }
  });

  // ---- MIXED ----------------------------------------------------------

  it('mixed tax, full return: entitlement adds ONLY the exclusive share; revenue strips ONLY the inclusive share', async () => {
    await setDefaultProfile('MX-MIX');
    const inv = await commitSale(pm, '3', '77.00', '247.50');
    // gross 231; net 220 (levy 11 inside); VAT 16.5 on top; total 247.50
    expect(inv.total).toBe('247.5000');
    expect(inv.taxTotal).toBe('27.5000');
    expect(inv.taxInclusive).toBe(true);

    const ret = await processReturn(inv.id, inv.lines[0]!.id, '3', 'mixed full');
    // entitlement = 231 gross slice + 16.5 exclusive VAT = 247.50
    // (the OLD defect produced 231 + 27.5 = 258.50 and an unbalanced journal)
    expect(ret.grossCredit).toBe('247.5000');
    expect(ret.refundAmount).toBe('247.5000');
    expect(ret.cogsReversal).toBe('180.0000'); // 3 × 60

    const cn = await creditNoteRow(ret.creditNoteId);
    expect(cn.total).toBe('247.5000');
    expect(cn.credited_net).toBe('231.0000'); // gross axis
    expect(cn.net_revenue_reversal).toBe('220.0000'); // 231 − 11 embedded levy
    expect(cn.tax_reversal_total).toBe('27.5000'); // 11 levy + 16.5 VAT
    // identity: total == net_revenue_reversal + tax_reversal_total
    expect(Number(cn.total)).toBe(Number(cn.net_revenue_reversal) + Number(cn.tax_reversal_total));

    const comps = await creditNoteComponents(ret.creditNoteId);
    expect(comps).toHaveLength(2);
    const levy = comps.find((c) => c.component_name === 'LEVY')!;
    const vat = comps.find((c) => c.component_name === 'VAT')!;
    expect(levy.inclusive).toBe(true);
    expect(levy.tax_amount).toBe('11.0000');
    expect(levy.taxable_basis).toBe('231.0000'); // gross slice
    expect(vat.inclusive).toBe(false);
    expect(vat.tax_amount).toBe('16.5000');
    expect(vat.taxable_basis).toBe('220.0000'); // net-of-levy slice

    // journal: Dr revenue 220, Dr tax 11 + 16.5, Dr inventory 180 / Cr cogs 180, Cr refunds 247.50
    const lines = await journalByAccount('credit_note', ret.creditNoteId);
    const byAccount = new Map(lines.map((l) => [l.account, l]));
    expect(byAccount.get('4000')!.debit).toBe('220.0000');
    expect(byAccount.get('1200')!.debit).toBe('180.0000');
    expect(byAccount.get('5000')!.credit).toBe('180.0000');
    expect(byAccount.get('2150')!.credit).toBe('247.5000');
    // two tax lines on 2200: 11 (LEVY) and 16.5 (VAT)
    const taxLegs = lines.filter((l) => l.account === '2200');
    expect(taxLegs).toHaveLength(2);
    expect(taxLegs.map((l) => l.debit).sort()).toEqual(['11.0000', '16.5000']);
    const { dr } = assertBalanced(lines);
    expect(dr).toBe(220 + 11 + 16.5 + 180); // 427.50
  });

  it('mixed tax, three cumulative partials: per-component slices close EXACTLY on the posted amounts', async () => {
    await setDefaultProfile('MX-MIX');
    const inv = await commitSale(pm, '3', '77.00', '247.50');
    const lineId = inv.lines[0]!.id;

    // 1 of 3: gross slice 77; levy round4(11×77/231)=3.6667; VAT 5.5
    const r1 = await processReturn(inv.id, lineId, '1', 'mixed partial 1');
    expect(r1.grossCredit).toBe('82.5000'); // 77 + 5.5 — NOT 77 + 3.6667 + 5.5
    const cn1 = await creditNoteRow(r1.creditNoteId);
    expect(cn1.credited_net).toBe('77.0000');
    expect(cn1.net_revenue_reversal).toBe('73.3333'); // 77 − 3.6667
    expect(cn1.tax_reversal_total).toBe('9.1667'); // 3.6667 + 5.5
    const comps1 = await creditNoteComponents(r1.creditNoteId);
    expect(comps1.find((c) => c.component_name === 'LEVY')!.tax_amount).toBe('3.6667');
    expect(comps1.find((c) => c.component_name === 'VAT')!.tax_amount).toBe('5.5000');

    // 2nd unit: levy 7.3333 − 3.6667 = 3.6666 (cumulative rounding residue)
    const r2 = await processReturn(inv.id, lineId, '1', 'mixed partial 2');
    expect(r2.grossCredit).toBe('82.5000');
    const cn2 = await creditNoteRow(r2.creditNoteId);
    expect(cn2.net_revenue_reversal).toBe('73.3334'); // 77 − 3.6666
    const comps2 = await creditNoteComponents(r2.creditNoteId);
    expect(comps2.find((c) => c.component_name === 'LEVY')!.tax_amount).toBe('3.6666');
    expect(comps2.find((c) => c.component_name === 'VAT')!.tax_amount).toBe('5.5000');

    // 3rd unit: levy 11 − 7.3333 = 3.6667 → cumulative closes EXACTLY
    const r3 = await processReturn(inv.id, lineId, '1', 'mixed partial 3');
    expect(r3.grossCredit).toBe('82.5000');

    const sums = await fx.admin.query(
      `SELECT COALESCE(SUM(credited_net),0)::text AS net, COALESCE(SUM(tax_reversal_total),0)::text AS tax,
              COALESCE(SUM(total),0)::text AS total, COALESCE(SUM(net_revenue_reversal),0)::text AS nrr
         FROM credit_note WHERE invoice_id = $1`,
      [inv.id],
    );
    expect(sums.rows[0]!.net).toBe('231.0000'); // the full gross axis
    expect(sums.rows[0]!.tax).toBe('27.5000'); // 11 levy + 16.5 VAT — EXACT
    expect(sums.rows[0]!.total).toBe('247.5000'); // 3 × 82.50
    expect(sums.rows[0]!.nrr).toBe('220.0000'); // 231 − 11
    // per-component cumulative caps
    const compSums = await fx.admin.query(
      `SELECT component_name, COALESCE(SUM(tax_amount),0)::text AS tax
         FROM credit_note_tax_component WHERE invoice_id = $1 GROUP BY component_name`,
      [inv.id],
    );
    const byName = new Map(compSums.rows.map((r) => [r.component_name, r.tax]));
    expect(byName.get('LEVY')).toBe('11.0000');
    expect(byName.get('VAT')).toBe('16.5000');
    for (const cnId of [r1.creditNoteId, r2.creditNoteId, r3.creditNoteId]) {
      assertBalanced(await journalByAccount('credit_note', cnId));
    }
  });
});
