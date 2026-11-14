/**
 * Phase 7a rules-based intelligence — end-to-end proof on a real
 * PostgreSQL: seeded histories produce EXACT alerts (dead stock,
 * stockout risk, anomaly rules), re-scans dedupe instead of flooding,
 * the lifecycle/feedback loop works, RBAC + tenant isolation hold,
 * tenant-setting threshold overrides take effect, and a failing rule
 * is isolated (its own ai_model_run row marked failed — the other
 * rules still complete).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, seedUser, login, type ApiFixture } from './helpers.js';

interface AlertRow {
  id: string;
  rule_id: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  entity_label: string;
  title: string;
}
interface RunRow {
  id: string;
  rule_id: string;
  rule_version: string;
  alerts_created: number;
  alerts_suppressed: number;
  status: 'completed' | 'failed';
  error: string | null;
}
interface ScanRun {
  ruleId: string;
  status: 'completed' | 'failed';
  alertsCreated: number;
  alertsSuppressed: number;
  error: string | null;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Phase 7a intelligence: rules, queue semantics, RBAC, config, isolation', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;
  let wh: string;
  const products: Record<string, string> = {};
  let discCode = '';

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    auditor = auth(fx.tenantA.users.auditor!.token!);

    // extra roles for the matrix (read-only tier: accountant, procurement)
    const accId = await seedUser(fx.admin, fx.tenantA.tenantId, 'accountant@tenant-a.test', 'Accountant-Pass-1', ['accountant']);
    void accId;
    const accToken = await login(app, 'tenant-a', 'accountant@tenant-a.test', 'Accountant-Pass-1');
    (fx.tenantA.users as Record<string, { id: string; email: string; password: string; token?: string }>).accountant = {
      id: accId, email: 'accountant@tenant-a.test', password: 'Accountant-Pass-1', token: accToken,
    };
    const procId = await seedUser(fx.admin, fx.tenantA.tenantId, 'procurement@tenant-a.test', 'Procurement-Pass-1', ['procurement']);
    const procToken = await login(app, 'tenant-a', 'procurement@tenant-a.test', 'Procurement-Pass-1');
    (fx.tenantA.users as Record<string, { id: string; email: string; password: string; token?: string }>).procurement = {
      id: procId, email: 'procurement@tenant-a.test', password: 'Procurement-Pass-1', token: procToken,
    };

    wh = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'INT-WH', name: 'Intelligence WH' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'INT-PC', name: 'Intelligence Pieces' })).body.id;

    const mkProduct = async (code: string, price: string) => {
      const res = await request(app.getHttpServer()).post('/api/products').set(owner).send({
        code, name: `Intelligence ${code}`, baseUnitId: unit, sellingPrice: price, purchasePrice: '10.00',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      products[code] = res.body.id as string;
    };
    for (const code of ['DEAD1', 'IDLE1', 'FAST1', 'OUT1', 'STEADY1', 'DISC1', 'AH1', 'VOID1', 'REV1']) {
      await mkProduct(code, '50.00');
    }

    // opening stock, dated 40 days ago by backdating the receipt movements
    // after posting (stock_balance is unaffected); FAST1 gets 200 so a 190
    // sale does not trip the oversell policy
    const openingQty: Record<string, string> = {
      DEAD1: '100', IDLE1: '100', FAST1: '200', OUT1: '100', STEADY1: '100',
      DISC1: '100', AH1: '100', VOID1: '100', REV1: '100',
    };
    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh,
      authority: 'physical_count',
      businessDate: new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10),
      lines: Object.entries(openingQty).map(([code, quantityBase]) => ({ productId: products[code]!, quantityBase, unitCost: '10.00' })),
    });
    expect(opening.status, JSON.stringify(opening.body)).toBe(201);
    await fx.admin.query(
      `UPDATE stock_movement SET occurred_at = date_trunc('day', now() - interval '40 days') + interval '12 hours'
        WHERE tenant_id = $1 AND movement_type = 'receipt' AND reason = 'opening_balance'`,
      [fx.tenantA.tenantId],
    );
    // DEAD1 and IDLE1 carry OLDER stock (90 days) — their own receipts
    for (const code of ['DEAD1', 'IDLE1']) {
      await fx.admin.query(
        `UPDATE stock_movement SET occurred_at = date_trunc('day', now() - interval '90 days') + interval '12 hours'
          WHERE tenant_id = $1 AND product_id = $2 AND movement_type = 'receipt' AND reason = 'opening_balance'`,
        [fx.tenantA.tenantId, products[code]!],
      );
    }

    const commitSale = async (code: string, units: string, tenders: unknown[], extra: Record<string, unknown> = {}) => {
      const res = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
        warehouseId: wh,
        lines: [{ productId: products[code]!, quantityBase: units, unitPrice: '50.00' }],
        tenders,
        ...extra,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body as { invoice: { id: string; code: string } };
    };
    const backdate = async (invoiceId: string, days: number) => {
      // midday on the target day: deterministic AND inside the operating
      // window, so backdated sales never pollute the after-hours rule
      const stamp = `date_trunc('day', now() - interval '${days} days') + interval '12 hours'`;
      await fx.admin.query(
        `UPDATE invoice SET occurred_at = ${stamp}, created_at = ${stamp},
                business_date = (now() - interval '${days} days')::date
          WHERE id = $1`,
        [invoiceId],
      );
      await fx.admin.query(
        `UPDATE stock_movement SET occurred_at = ${stamp}
          WHERE tenant_id = $1 AND movement_type = 'issue' AND source_document_id = $2`,
        [fx.tenantA.tenantId, invoiceId],
      );
    };

    // IDLE1: sold 70 days ago → dead stock (threshold 60)
    await backdate((await commitSale('IDLE1', '5', [{ method: 'cash', amount: '250.00' }])).invoice.id, 70);
    // FAST1: 190 sold 10 days ago → 10 on hand vs ~6.3/day → low cover
    await backdate((await commitSale('FAST1', '190', [{ method: 'cash', amount: '9500.00' }])).invoice.id, 10);
    // OUT1: sold out 2 days ago → stocked out while selling (critical)
    await backdate((await commitSale('OUT1', '100', [{ method: 'cash', amount: '5000.00' }])).invoice.id, 2);
    // STEADY1: sold yesterday, plenty of cover → NO alert expected
    await backdate((await commitSale('STEADY1', '5', [{ method: 'cash', amount: '250.00' }])).invoice.id, 1);
    // DEAD1: never sold, stock is 90 days old → dead stock (never-sold)

    // DISC1: 30% order discount → critical anomaly (owner approves own override)
    const disc = await commitSale('DISC1', '2', [{ method: 'cash', amount: '70.00' }], {
      orderDiscount: '30.00',
      discountOverride: { reason: 'intelligence test: documented deep discount', approver: { username: 'owner@tenant-a.test', password: 'Owner-Pass-1' } },
    });
    expect(disc.invoice.id).toBeTruthy();
    discCode = disc.invoice.code;

    // AH1: after-hours timestamp (02:30 UTC, outside 06–21)
    const ah = await commitSale('AH1', '1', [{ method: 'cash', amount: '50.00' }]);
    // VOID1 → artificial void (no production path voids; the DDL allows it)
    const voided = await commitSale('VOID1', '1', [{ method: 'cash', amount: '50.00' }]);
    // REV1 → real reversal through the correction API
    const rev = await commitSale('REV1', '1', [{ method: 'cash', amount: '50.00' }]);

    // every "normal" invoice gets a deterministic in-hours timestamp so the
    // suite passes at any hour of the day it runs
    for (const inv of [disc.invoice.id, voided.invoice.id, rev.invoice.id]) {
      await fx.admin.query(
        `UPDATE invoice SET occurred_at = date_trunc('day', now()) + interval '12 hours' WHERE id = $1`,
        [inv],
      );
    }
    await fx.admin.query(
      `UPDATE invoice SET occurred_at = date_trunc('day', now()) + interval '2 hours 30 minutes' WHERE id = $1`,
      [ah.invoice.id],
    );
    await fx.admin.query(`UPDATE invoice SET status = 'voided' WHERE id = $1`, [voided.invoice.id]);
    const reversal = await request(app.getHttpServer())
      .post(`/api/sales/invoices/${rev.invoice.id}/reverse`)
      .set(owner)
      .send({ reason: 'intelligence test: reversal surface proof' });
    expect(reversal.status, JSON.stringify(reversal.body)).toBe(201);

    // closed shift with an 80.00 variance (band: warn ≥ 50, critical ≥ 200)
    await fx.admin.query(
      `INSERT INTO cashier_shift (tenant_id, code, user_id, warehouse_id, status, opening_float,
                                   opened_at, closed_at, closed_by, expected_cash, counted_cash, variance)
       VALUES ($1,'INT-SH-1',$2,$3,'closed','100.0000',
               now() - interval '2 days', now() - interval '1 day', $2, '500.0000', '420.0000', '-80.0000')`,
      [fx.tenantA.tenantId, fx.tenantA.users.manager!.id, wh],
    );

    // large DIRECT stock adjustment: +25 base units (warn ≥ 20) — on DISC1,
    // so the STEADY1 canary stays silent across every rule
    const adjustment = await request(app.getHttpServer()).post('/api/stock-adjustments').set(owner).send({
      warehouseId: wh,
      reason: 'intelligence test: damage reconciliation',
      lines: [{ productId: products.DISC1!, quantityBase: '25' }],
    });
    expect(adjustment.status, JSON.stringify(adjustment.body)).toBe(201);
  });

  afterAll(async () => {
    await fx.close();
  });

  async function scan(as: Record<string, string>, body: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer()).post('/api/intelligence/scan').set(as).send({ windowDays: 30, ...body });
    return { status: res.status, body: res.body as { runs: ScanRun[] } };
  }

  async function alerts(as: Record<string, string>, query = '') {
    const res = await request(app.getHttpServer()).get(`/api/intelligence/alerts${query}`).set(as);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as AlertRow[];
  }

  const byRule = (rows: AlertRow[], rule: string, labelPart?: string) =>
    rows.filter((a) => a.rule_id === rule && (!labelPart || a.entity_label.includes(labelPart)));

  it('seeds produce the exact expected alert set on the first scan', async () => {
    const { status, body } = await scan(manager);
    expect(status, JSON.stringify(body)).toBe(201);
    expect(body.runs).toHaveLength(8);
    for (const r of body.runs) {
      expect(r.status, `rule ${r.ruleId}: ${r.error}`).toBe('completed');
    }

    const rows = await alerts(manager, '?status=open');
    expect(byRule(rows, 'dead-stock')).toHaveLength(2); // DEAD1 (never sold) + IDLE1 (70d)
    expect(byRule(rows, 'dead-stock', 'DEAD1')[0]!.severity).toBe('warning');
    expect(byRule(rows, 'dead-stock', 'IDLE1')[0]!.severity).toBe('warning');

    const stockouts = byRule(rows, 'stockout-risk');
    expect(stockouts).toHaveLength(2);
    expect(byRule(rows, 'stockout-risk', 'OUT1')[0]!.severity).toBe('critical');
    expect(byRule(rows, 'stockout-risk', 'FAST1')[0]!.severity).toBe('warning');

    expect(byRule(rows, 'anomaly:invoice-discount', discCode)).toHaveLength(1);
    expect(byRule(rows, 'anomaly:invoice-discount', discCode)[0]!.severity).toBe('critical');
    expect(byRule(rows, 'anomaly:after-hours')).toHaveLength(1); // AH1 only — the in-hours invoices stay silent
    expect(byRule(rows, 'anomaly:after-hours')[0]!.severity).toBe('info');
    expect(byRule(rows, 'anomaly:shift-variance')).toHaveLength(1);
    expect(byRule(rows, 'anomaly:shift-variance')[0]!.severity).toBe('warning');
    expect(byRule(rows, 'anomaly:stock-adjustment')).toHaveLength(1);
    expect(byRule(rows, 'anomaly:stock-adjustment')[0]!.severity).toBe('warning');
    expect(byRule(rows, 'anomaly:invoice-voided')).toHaveLength(1);
    expect(byRule(rows, 'anomaly:invoice-reversal')).toHaveLength(1);

    // the steady product stays silent across every rule
    expect(rows.filter((a) => a.entity_label.includes('STEADY1'))).toHaveLength(0);
  });

  it('alert detail carries the explicit reason and machine-checkable evidence', async () => {
    const rows = await alerts(manager, '?ruleId=stockout-risk');
    const out = rows.find((a) => a.entity_label.includes('OUT1'))!;
    const detail = await request(app.getHttpServer()).get(`/api/intelligence/alerts/${out.id}`).set(manager);
    expect(detail.status).toBe(200);
    const alert = detail.body.alert as { reason: string; evidence: Record<string, unknown> };
    expect(alert.reason).toContain('OUT1');
    expect(alert.reason).toContain('out of stock');
    expect(alert.evidence.productCode).toBe('OUT1');
    expect(alert.evidence.demandInWindow).toBe('100.000000');
    expect(alert.evidence.daysOfCover).toBe(0);
  });

  it('re-scans dedupe against open alerts instead of flooding the queue', async () => {
    const before = (await alerts(manager, '?status=open')).length;
    const { body } = await scan(manager);
    const deadRun = body.runs.find((r) => r.ruleId === 'dead-stock')!;
    expect(deadRun.alertsCreated).toBe(0);
    expect(deadRun.alertsSuppressed).toBe(2);
    expect((await alerts(manager, '?status=open')).length).toBe(before);
  });

  it('lifecycle: acknowledge → resolve; a re-scan re-opens only the resolved condition', async () => {
    const open = byRule(await alerts(manager, '?status=open'), 'dead-stock', 'DEAD1')[0]!;
    const ack = await request(app.getHttpServer()).post(`/api/intelligence/alerts/${open.id}/acknowledge`).set(manager).send({});
    expect(ack.status).toBe(201);
    expect(ack.body.status).toBe('acknowledged');

    const resolve = await request(app.getHttpServer()).post(`/api/intelligence/alerts/${open.id}/resolve`).set(manager).send({
      note: 'markdown scheduled',
    });
    expect(resolve.status).toBe(201);
    expect(resolve.body.status).toBe('resolved');
    expect(resolve.body.resolution_note).toBe('markdown scheduled');

    const before = (await alerts(manager, '?status=open')).length;
    await scan(manager);
    const reopened = byRule(await alerts(manager, '?status=open'), 'dead-stock', 'DEAD1');
    expect(reopened).toHaveLength(1); // condition still holds → fresh alert
    expect((await alerts(manager, '?status=open')).length).toBe(before + 1);
  });

  it('terminal states are final and dismissal requires a note', async () => {
    const open = byRule(await alerts(manager, '?status=open'), 'dead-stock', 'DEAD1')[0]!;
    const noNote = await request(app.getHttpServer()).post(`/api/intelligence/alerts/${open.id}/dismiss`).set(manager).send({});
    expect(noNote.status).toBe(400);

    const dismiss = await request(app.getHttpServer()).post(`/api/intelligence/alerts/${open.id}/dismiss`).set(manager).send({
      note: 'legacy stock, being returned to supplier',
    });
    expect(dismiss.status).toBe(201);
    expect(dismiss.body.status).toBe('dismissed');

    const again = await request(app.getHttpServer()).post(`/api/intelligence/alerts/${open.id}/resolve`).set(manager).send({ note: 'x' });
    expect(again.status).toBe(400);
  });

  it('feedback upserts per user and shows in the detail', async () => {
    const any = (await alerts(manager))[0]!;
    const first = await request(app.getHttpServer()).post(`/api/intelligence/alerts/${any.id}/feedback`).set(auditor).send({
      useful: false, reason: 'threshold too tight for this category',
    });
    expect(first.status).toBe(201);
    expect(first.body.useful).toBe(false);

    const second = await request(app.getHttpServer()).post(`/api/intelligence/alerts/${any.id}/feedback`).set(auditor).send({
      useful: true,
    });
    expect(second.status).toBe(201);

    const detail = await request(app.getHttpServer()).get(`/api/intelligence/alerts/${any.id}`).set(manager);
    expect(detail.body.alert.total_feedback).toBe(1); // upsert, not a second row
    expect(detail.body.alert.useful_count).toBe(1);
    expect(detail.body.feedback).toHaveLength(1);
  });

  it('RBAC: cashiers see nothing; read-tier roles read + feedback only; managers manage', async () => {
    expect((await request(app.getHttpServer()).get('/api/intelligence/alerts').set(cashier)).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/intelligence/rules').set(cashier)).status).toBe(403);
    expect((await request(app.getHttpServer()).post('/api/intelligence/scan').set(cashier).send({})).status).toBe(403);

    expect((await request(app.getHttpServer()).get('/api/intelligence/alerts').set(auditor)).status).toBe(200);
    expect((await request(app.getHttpServer()).post('/api/intelligence/scan').set(auditor).send({})).status).toBe(403);
    const any = (await alerts(auditor))[0]!;
    expect(
      (await request(app.getHttpServer()).post(`/api/intelligence/alerts/${any.id}/acknowledge`).set(auditor).send({})).status,
    ).toBe(403);

    const accountant = auth((fx.tenantA.users as Record<string, { token?: string }>).accountant!.token!);
    const procurement = auth((fx.tenantA.users as Record<string, { token?: string }>).procurement!.token!);
    expect((await request(app.getHttpServer()).get('/api/intelligence/alerts').set(accountant)).status).toBe(200);
    expect((await request(app.getHttpServer()).post('/api/intelligence/scan').set(accountant).send({})).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/intelligence/alerts').set(procurement)).status).toBe(200);
  });

  it('tenant isolation: tenant B sees none of tenant A\'s alerts', async () => {
    const bOwner = auth(fx.tenantB.users.owner!.token!);
    const res = await request(app.getHttpServer()).get('/api/intelligence/alerts').set(bOwner);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
    const scanB = await request(app.getHttpServer()).post('/api/intelligence/scan').set(bOwner).send({});
    expect(scanB.status).toBe(201);
    expect((await request(app.getHttpServer()).get('/api/intelligence/alerts').set(bOwner)).body).toHaveLength(0);
  });

  it('rejects unknown rule ids with a 400', async () => {
    const res = await request(app.getHttpServer()).post('/api/intelligence/scan').set(manager).send({ rules: ['nonsense'] });
    expect(res.status).toBe(400);
  });

  it('tenant-setting threshold overrides change rule outcomes on the next scan', async () => {
    // raise the shift-variance warning band to 100 → the 80 variance stops alerting
    const set = await request(app.getHttpServer()).post('/api/reports/settings').set(owner).send({
      key: 'intelligence.rules',
      value: { anomaly: { shiftVarianceWarn: 100 } },
      note: 'intelligence test: relaxed variance band',
    });
    expect(set.status, JSON.stringify(set.body)).toBe(201);

    // resolve the standing variance alert, then re-scan: it must NOT come back
    const standing = byRule(await alerts(manager, '?status=open'), 'anomaly:shift-variance')[0]!;
    await request(app.getHttpServer()).post(`/api/intelligence/alerts/${standing.id}/resolve`).set(manager).send({ note: 're-baselining' });
    await scan(manager);
    expect(byRule(await alerts(manager, '?status=open'), 'anomaly:shift-variance')).toHaveLength(0);
  });

  it('a failing rule is isolated: its run is recorded failed, the others still complete', async () => {
    // poison the shift-variance band with a value that cannot parse at
    // MONEY_SCALE — the evaluator fails loudly (exact-decimal culture),
    // ONLY for the rule that consumes it. (Same-day re-versioning is not
    // possible through the settings API by design — corrections are new
    // versions — so this test mutates the standing version directly.)
    await fx.admin.query(
      `UPDATE tenant_setting SET value = '{"anomaly":{"shiftVarianceWarn":0.00001}}'::jsonb
        WHERE tenant_id = $1 AND key = 'intelligence.rules'`,
      [fx.tenantA.tenantId],
    );

    const { status, body } = await scan(manager, { rules: ['anomaly:shift-variance', 'anomaly:after-hours'] });
    expect(status).toBe(201); // the scan itself never throws
    const failed = body.runs.find((r) => r.ruleId === 'anomaly:shift-variance')!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toBeTruthy();
    const other = body.runs.find((r) => r.ruleId === 'anomaly:after-hours')!;
    expect(other.status, `after-hours run error: ${other.error}`).toBe('completed');

    // the failed run is in the ledger with its error recorded
    const runsRes = await request(app.getHttpServer()).get('/api/intelligence/runs?limit=50').set(manager);
    const failedRun = (runsRes.body as RunRow[]).find((r) => r.rule_id === 'anomaly:shift-variance' && r.status === 'failed');
    expect(failedRun).toBeTruthy();
    expect(failedRun!.error).toBeTruthy();
    expect(failedRun!.rule_version).toBe('1.0.0');

    // restore the default configuration (empty override → domain defaults)
    await fx.admin.query(
      `UPDATE tenant_setting SET value = '{}'::jsonb
        WHERE tenant_id = $1 AND key = 'intelligence.rules'`,
      [fx.tenantA.tenantId],
    );
  });
});
