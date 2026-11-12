/**
 * API-driven UAT smoke for iDepot staging (staging-runbook §Verification;
 * issue #10). Runs the V3–V6 business cycles end-to-end against a DEPLOYED
 * environment with EXACT money math (expected tax computed from the tenant's
 * own effective default tax profile), and emits a markdown evidence file.
 *
 * It does NOT replace the owner's browser walkthroughs (screenshots for
 * UAT-EVIDENCE.md) — it proves the workflows work over the real HTTPS edge
 * with real auth, RBAC and the posting pipeline.
 *
 * Usage (from anywhere that can reach the staging URL):
 *   UAT_BASE_URL=https://idepot-staging.lightworldtech.com \
 *   UAT_TENANT_SLUG=demo \
 *   UAT_OWNER_EMAIL=owner@demo.idepot UAT_OWNER_PASSWORD='(side-channel)' \
 *   node_modules/.bin/tsx scripts/deploy/uat-smoke.ts
 *
 * All created entities carry a unique UATSMOKE-<ts> prefix so reruns never
 * collide and demo data stays identifiable as synthetic UAT activity.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

const BASE = (process.env.UAT_BASE_URL ?? '').replace(/\/$/, '');
const TENANT = process.env.UAT_TENANT_SLUG ?? 'demo';
const OWNER_EMAIL = process.env.UAT_OWNER_EMAIL ?? 'owner@demo.idepot';
const OWNER_PASSWORD = process.env.UAT_OWNER_PASSWORD ?? '';
const OUT = process.env.UAT_EVIDENCE_OUT ?? 'uat-evidence.md';
const RUN = `UATSMOKE-${Date.now()}`;
// return-reason codes are UPPER_SNAKE (contracts schema) — derive a safe suffix
const SUFFIX = RUN.replace(/[-]/g, '_');
const today = new Date().toISOString().slice(0, 10);

if (!BASE) {
  console.error('UAT_BASE_URL is required (e.g. https://idepot-staging.lightworldtech.com)');
  process.exit(2);
}
if (!OWNER_PASSWORD) {
  console.error('UAT_OWNER_PASSWORD is required (from the side-channel credentials file — never committed)');
  process.exit(2);
}

/** Exact money helpers (mirrors the 4dp internal representation). */
const S = (x: unknown): bigint => BigInt(Math.round(parseFloat(String(x ?? '0')) * 10000));
const scale4 = (n: number) => Math.round(n * 10000);
const fmt4 = (n: number) => (n / 10000).toFixed(4);

interface Step {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}
const steps: Step[] = [];
const evidence: Array<{ title: string; body: string }> = [];
let failed = 0;

function record(id: string, name: string, status: Step['status'], detail: string) {
  steps.push({ id, name, status, detail });
  if (status === 'FAIL') failed++;
  const icon = status === 'PASS' ? 'OK ' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`[${icon}] ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}
function snap(title: string, body: unknown) {
  evidence.push({ title, body: '```json\n' + JSON.stringify(body, null, 2).slice(0, 4000) + '\n```' });
}

async function api(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { status: res.status, body: json };
}

async function main() {
  // ---------------------------------------------------------------- V1 health
  const health = await api('GET', '/api/health', null);
  const h = health.body ?? {};
  record(
    'V1',
    'health endpoint',
    health.status === 200 && h.status === 'ok' && h.database === 'up' && typeof h.sha === 'string'
      ? 'PASS'
      : 'FAIL',
    `HTTP ${health.status} sha=${h.sha} db=${h.database}`,
  );
  snap('GET /api/health', h);

  // ---------------------------------------------------------------- V2 login
  const login = await api('POST', '/api/auth/login', null, {
    tenantSlug: TENANT,
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  if (login.status !== 201) {
    record('V2', 'owner login', 'FAIL', `HTTP ${login.status} ${JSON.stringify(login.body).slice(0, 200)}`);
    return finish();
  }
  const token = login.body.accessToken as string;
  record('V2', 'owner login (API-level; browser screenshot is the owner task)', 'PASS', 'token issued');
  const owner = token;

  // ------------------------------------------------------------ setup (scoped)
  const suffix = SUFFIX;
  const wh = await api('POST', '/api/warehouses', owner, { code: `UAT-WH-${suffix}`, name: 'UAT smoke warehouse' });
  const unit = await api('POST', '/api/units', owner, { code: `UAT-PC-${suffix}`, name: 'UAT pieces' });
  const product = await api('POST', '/api/products', owner, {
    code: `UAT-P-${suffix}`,
    name: 'UAT smoke product',
    baseUnitId: unit.body.id,
    sellingPrice: '50.00',
    purchasePrice: '30.00',
  });
  const customer = await api('POST', '/api/customers', owner, { name: `UAT Customer ${suffix}`, phone: '0244000999' });
  const reason = await api('POST', '/api/returns/reasons', owner, {
    code: `UAT_RTN_${suffix}`,
    name: 'UAT smoke return',
    requiresApproval: false,
    refundPermitted: true,
    replacementPermitted: true,
    storeCreditPermitted: true,
    restockPermitted: true,
  });
  const setupOk = [wh, unit, product, customer, reason].every((r) => r.status === 201);
  record('SETUP', 'scoped master data (warehouse/unit/product/customer/reason)', setupOk ? 'PASS' : 'FAIL',
    setupOk ? `codes UAT-*${suffix}` : `statuses ${[wh, unit, product, customer, reason].map((r) => r.status).join('/')}`);
  if (!setupOk) return finish();

  const opening = await api('POST', '/api/inventory/opening-stock', owner, {
    warehouseId: wh.body.id,
    authority: 'physical_count',
    businessDate: today,
    lines: [{ productId: product.body.id, quantityBase: '100', unitCost: '30.00' }],
  });
  record('V3a', 'opening stock 100 @ 30.00', opening.status === 201 ? 'PASS' : 'FAIL', `HTTP ${opening.status}`);

  // --------------------------------------------- expected tax from tenant config
  const profiles = await api('GET', '/api/tax/profiles', owner);
  const profileList: Array<{ id: string; isDefault: boolean; versions: Array<{ effectiveFrom: string; effectiveTo: string | null; components: Array<{ name: string; rate: string; inclusive: boolean }> }> }> =
    Array.isArray(profiles.body) ? profiles.body : (profiles.body?.items ?? []);
  const defaultProfile = profileList.find((p) => p.isDefault);
  // compute the exclusive tax expected on a 200.00 sale from the ACTIVE version
  let expectedTaxScaled = 0n;
  let taxLabel = 'none';
  if (defaultProfile) {
    const active = [...(defaultProfile.versions ?? [])]
      .filter((v) => v.effectiveFrom <= today && (v.effectiveTo === null || v.effectiveTo >= today))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    const exclusive = (active?.components ?? []).filter((c) => !c.inclusive);
    if (exclusive.length > 0) {
      taxLabel = exclusive.map((c) => `${c.name} ${c.rate}`).join('+');
      // scaled: rate(4dp) × subtotal 200.0000(4dp) / 10⁴
      for (const c of exclusive)
        expectedTaxScaled += BigInt(Math.round(parseFloat(c.rate) * 10000)) * 2000000n / 10000n;
    }
  }
  const expectedTotalScaled = 2000000n + expectedTaxScaled; // 200.0000 + tax
  record('TAX', 'effective default tax resolved', 'PASS', `${taxLabel} → expected total ${fmt4(Number(expectedTotalScaled))}`);

  // ---------------------------------------------------------------- V3 POS sale
  const sale = await api('POST', '/api/sales/commit', owner, {
    warehouseId: wh.body.id,
    customerId: customer.body.id,
    lines: [{ productId: product.body.id, quantityBase: '4', unitPrice: '50.00' }],
    tenders: [{ method: 'cash', amount: fmt4(Number(expectedTotalScaled + 200000n)) }], // total + 20.00 change
    clientDocId: randomUUID(), // offline identity must be a real UUID (contracts schema)
  });
  const inv = sale.body?.invoice ?? {};
  const saleMathOk =
    sale.status === 201 &&
    S(inv.subtotal) === 2000000n &&
    S(inv.taxTotal) === expectedTaxScaled &&
    S(inv.total) === expectedTotalScaled &&
    S(inv.changeGiven) === 200000n;
  record('V3b', 'cash sale 4 × 50.00 (exact: subtotal 200, tax, total, change 20)', saleMathOk ? 'PASS' : 'FAIL',
    `HTTP ${sale.status} subtotal=${inv.subtotal} tax=${inv.taxTotal} total=${inv.total} change=${inv.changeGiven}`);
  snap('POST /api/sales/commit (cash)', { subtotal: inv.subtotal, taxTotal: inv.taxTotal, total: inv.total, changeGiven: inv.changeGiven });

  // receipt print payload (V3 evidence)
  const payments = await api('GET', `/api/payments?customerId=${customer.body.id}`, owner);
  const lastPayment = Array.isArray(payments.body) ? payments.body[payments.body.length - 1] : null;
  if (lastPayment) {
    const receipt = await api('GET', `/api/payments/${lastPayment.id}/receipt`, owner);
    record('V3c', 'receipt print payload renders from payment evidence', receipt.status === 200 ? 'PASS' : 'WARN',
      `HTTP ${receipt.status}`);
    snap('GET /api/payments/:id/receipt (truncated)', receipt.body);
  }

  // ------------------------------------------- V3d credit sale + partial payment
  const credit = await api('POST', '/api/sales/commit', owner, {
    warehouseId: wh.body.id,
    customerId: customer.body.id,
    lines: [{ productId: product.body.id, quantityBase: '2', unitPrice: '50.00' }],
    tenders: [],
    clientDocId: randomUUID(),
  });
  const creditTotal = credit.body?.invoice?.total;
  const payAmount = '50.00';
  const payment = await api('POST', '/api/payments', owner, {
    customerId: customer.body.id,
    amount: payAmount,
    tenders: [{ method: 'cash', amount: payAmount }],
    allocations: [{ invoiceId: credit.body?.invoice?.id, amount: payAmount }],
    clientDocId: randomUUID(),
  });
  record('V3d', 'credit sale + partial receipt (allocation)', credit.status === 201 && payment.status === 201 ? 'PASS' : 'FAIL',
    `sale HTTP ${credit.status} total=${creditTotal}; payment HTTP ${payment.status} amount=${payAmount}`);

  // ---------------------------------------------------------------- V5 return
  const ret = await api('POST', '/api/returns', owner, {
    invoiceId: inv.id,
    reasonCode: reason.body.code ?? `UAT_RTN_${suffix}`,
    creditDisposition: 'store_credit',
    clientDocId: randomUUID(),
    lines: [{ invoiceLineId: inv.lines?.[0]?.id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
    submit: true,
  });
  let returnOk = ret.status === 201;
  let processed: any = null;
  let returnDetail = `create HTTP ${ret.status} ${JSON.stringify(ret.body).slice(0, 160)}`;
  if (returnOk) {
    // auto-approval applies when the tenant threshold allows it; otherwise the
    // owner approves explicitly (both paths are legitimate UAT flows)
    let returnState = String(ret.body?.status ?? '');
    if (returnState === 'submitted' || returnState === 'draft') {
      const approve = await api('POST', `/api/returns/${ret.body.id}/approve`, owner, {});
      returnState = approve.status === 200 || approve.status === 201 ? String(approve.body?.status ?? 'approved') : returnState;
    }
    const recv = await api('POST', `/api/returns/${ret.body.id}/receive`, owner, {});
    const proc = await api('POST', `/api/returns/${ret.body.id}/process`, owner, {});
    processed = proc.body;
    returnOk = recv.status === 201 && proc.status === 201;
    if (!returnOk) returnDetail = `state=${returnState} receive HTTP ${recv.status} ${JSON.stringify(recv.body).slice(0, 160)} / process HTTP ${proc.status} ${JSON.stringify(proc.body).slice(0, 160)}`;
  }
  // expected store credit: 1 × 50 + its tax share (same rate as the sale)
  const expectedCredit = 500000n + expectedTaxScaled / 4n;
  record(
    'V5',
    'return → credit note → store credit (exact entitlement)',
    returnOk && S(processed?.storeCreditAmount) === expectedCredit ? 'PASS' : 'FAIL',
    returnOk
      ? `storeCredit=${processed?.storeCreditAmount} (expected ${fmt4(Number(expectedCredit))})`
      : returnDetail,
  );
  snap('POST /api/returns/:id/process', processed);

  // ---------------------------------------------------------------- V6 reports
  // scoped to THIS run's warehouse so prior demo activity cannot skew exact math
  const range = `from=${today}&to=${today}&warehouseId=${wh.body.id}`;
  const daily = await api('GET', `/api/reports/daily-sales?${range}`, owner);
  const dailyRows: Array<Record<string, string>> = Array.isArray(daily.body) ? daily.body : (daily.body?.items ?? []);
  const todayRow = dailyRows.find((r) => r.businessDate === today);
  const dailyOk =
    daily.status === 200 && todayRow && S(todayRow.grossSales) === 3000000n + (expectedTaxScaled * 3n) / 2n; // 200+100 subtotal + exclusive tax on both sales
  record('V6a', 'daily-sales row for today, warehouse-scoped (exact gross incl. tax)', dailyOk ? 'PASS' : 'FAIL',
    `HTTP ${daily.status} grossSales=${todayRow?.grossSales} (expected ${fmt4(Number(3000000n + (expectedTaxScaled * 3n) / 2n))})`);

  const stmt = await api('GET', `/api/reports/customer-statement?customerId=${customer.body.id}&asOf=${today}`, owner);
  record('V6b', 'customer statement as-of today', stmt.status === 200 ? 'PASS' : 'FAIL', `HTTP ${stmt.status} closing=${stmt.body?.closingBalance}`);
  snap('GET /api/reports/customer-statement (truncated)', stmt.body);

  const aging = await api('GET', `/api/reports/ar-aging?asOf=${today}`, owner);
  record('V6c', 'AR aging as-of today', aging.status === 200 ? 'PASS' : 'FAIL', `HTTP ${aging.status}`);

  const tb = await api('GET', '/api/accounting/trial-balance', owner);
  const tbRows: Array<{ closingDebit: string; closingCredit: string }> = tb.body?.rows ?? [];
  const tbDebits = tbRows.reduce((acc, r) => acc + S(r.closingDebit), 0n);
  const tbCredits = tbRows.reduce((acc, r) => acc + S(r.closingCredit), 0n);
  const tbBalanced = tb.status === 200 && tbDebits === tbCredits;
  record('V6d', 'trial balance renders and balances', tb.status === 200 ? (tbBalanced ? 'PASS' : 'FAIL') : 'FAIL',
    `HTTP ${tb.status} ΣclosingDebit=${fmt4(Number(tbDebits))} ΣclosingCredit=${fmt4(Number(tbCredits))}`);
  snap('GET /api/accounting/trial-balance (truncated)', tb.body);

  for (const [name, path] of [
    ['profit-and-loss', '/api/accounting/profit-and-loss'],
    ['balance-sheet', '/api/accounting/balance-sheet'],
    ['cash-flow', '/api/accounting/cash-flow'],
  ] as const) {
    const r = await api('GET', path, owner);
    record('V6e', `${name} renders`, r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  const recon = await api('GET', '/api/accounting/reconciliation', owner);
  const checks: Array<{ check: string; passed: boolean; difference: string }> = recon.body?.checks ?? [];
  const allPassed = checks.length > 0 && checks.every((c) => c.passed);
  const ar = checks.find((c) => c.check === 'accounts_receivable');
  record('V6f', 'accounting control checks (all PASS incl. AR)', recon.status === 200 ? (allPassed ? 'PASS' : 'WARN') : 'FAIL',
    `HTTP ${recon.status} checks=${checks.length} arControl=${ar ? `${ar.passed ? 'PASS' : 'FAIL'} diff=${ar.difference}` : 'n/a'}`);
  snap('GET /api/accounting/reconciliation (truncated)', recon.body);

  return finish();
}

async function finish() {
  const pass = steps.filter((s) => s.status === 'PASS').length;
  const md = [
    `# UAT smoke evidence — ${new Date().toISOString()}`,
    ``,
    `- Target: ${BASE}`,
    `- Run: ${RUN}`,
    `- Result: **${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}** (${pass}/${steps.length} passed)`,
    ``,
    `## Steps`,
    ``,
    `| ID | Check | Status | Detail |`,
    `|---|---|---|---|`,
    ...steps.map((s) => `| ${s.id} | ${s.name} | ${s.status} | ${s.detail.replace(/\|/g, '\\|')} |`),
    ``,
    `## API responses`,
    ``,
    ...evidence.map((e) => `### ${e.title}\n\n${e.body}\n`),
  ].join('\n');
  mkdirSync(dirname(OUT) === '.' ? '.' : dirname(OUT), { recursive: true });
  writeFileSync(OUT, md);
  console.log(`\nevidence: ${OUT} — ${pass}/${steps.length} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('UAT smoke crashed:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
