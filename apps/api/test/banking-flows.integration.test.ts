/**
 * Phase 4 banking integration (ROADMAP: statement import + matching):
 *  - bank accounts FK'd to the chart of accounts;
 *  - transfers post balanced journals with explicit fees;
 *  - statement import: strict validation of untrusted input, file
 *    fingerprint dedupe, per-line identity dedupe;
 *  - matching: deterministic suggestions (never auto-posting), manual
 *    match/unmatch with direction + amount guards, split matching;
 *  - reconciliation finalization records explicit differences.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);

describe('Phase 4 banking', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let bankA: { id: string; code: string };
  let bankB: { id: string; code: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    for (const code of ['BNK-T1', 'BNK-T2']) {
      await fx.admin.query(
        `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance)
         VALUES ($1, $2, $2, 'asset', 'asset', 'debit')`,
        [fx.tenantA.tenantId, code],
      );
    }
    const a = await request(app.getHttpServer())
      .post('/api/banking/accounts')
      .set(manager)
      .send({ code: 'BK-A', bankName: 'Test Bank', branch: 'Accra Central', accountName: 'Operations', accountNumber: '1234567890', glAccountCode: 'BNK-T1' });
    const b = await request(app.getHttpServer())
      .post('/api/banking/accounts')
      .set(manager)
      .send({ code: 'BK-B', bankName: 'Test Bank', branch: 'Tema', accountName: 'Payroll', accountNumber: '9876543210', glAccountCode: 'BNK-T2' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    bankA = { id: a.body.id, code: a.body.code };
    bankB = { id: b.body.id, code: b.body.code };
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('transfer posts a balanced journal with an explicit fee leg', async () => {
    // fund bank A first
    const fund = await request(app.getHttpServer())
      .post('/api/accounting/journals')
      .set(manager)
      .send({
        businessDate: TODAY,
        description: 'opening bank funding',
        lines: [
          { accountCode: 'BNK-T1', debit: '1000.00' },
          { accountCode: '3950', credit: '1000.00' },
        ],
      });
    expect(fund.status).toBe(201);

    const trf = await request(app.getHttpServer())
      .post('/api/banking/transfers')
      .set(manager)
      .send({
        fromBankAccountId: bankA.id,
        toBankAccountId: bankB.id,
        businessDate: TODAY,
        amount: '300.00',
        fee: '7.50',
        reference: 'TRF-REF-1',
      });
    expect(trf.status).toBe(201);
    expect(trf.body.amount).toBe('300.0000');
    expect(trf.body.fee).toBe('7.5000');

    const journal = await fx.admin.query(
      `SELECT total_debit::text AS d, total_credit::text AS c FROM journal_entry
       WHERE source_kind = 'bank_transfer' AND source_id = $1`,
      [trf.body.id],
    );
    expect(journal.rows[0].d).toBe('307.5000'); // 300 destination + 7.50 fee
    expect(journal.rows[0].c).toBe('307.5000'); // 307.50 out of the source
    const lines = await fx.admin.query(
      `SELECT a.code, l.debit::text AS d, l.credit::text AS c
       FROM journal_line l JOIN gl_account a ON a.id = l.account_id
       WHERE l.entry_id = (SELECT id FROM journal_entry WHERE source_kind = 'bank_transfer' AND source_id = $1)`,
      [trf.body.id],
    );
    const byCode = new Map(lines.rows.map((r: { code: string; d: string; c: string }) => [r.code, r]));
    expect(byCode.get('BNK-T2')!.d).toBe('300.0000');
    expect(byCode.get('5400')!.d).toBe('7.5000'); // bank fee expense
    expect(byCode.get('BNK-T1')!.c).toBe('307.5000');
  });

  it('statement import validates untrusted input strictly', async () => {
    const badHeader = await request(app.getHttpServer())
      .post('/api/banking/statements/import')
      .set(manager)
      .send({
        bankAccountId: bankA.id,
        filename: 'bad.csv',
        statementDate: TODAY,
        content: 'foo,bar\n1,2\n',
      });
    expect(badHeader.status).toBe(400);
    expect(badHeader.body.error).toMatch(/header must include/i);

    const badDate = await request(app.getHttpServer())
      .post('/api/banking/statements/import')
      .set(manager)
      .send({
        bankAccountId: bankA.id,
        filename: 'bad2.csv',
        statementDate: TODAY,
        content: 'value_date,transaction_date,reference,description,direction,amount,balance\n02/11/2026,,ref1,desc,debit,100.00,\n',
      });
    expect(badDate.status).toBe(400);
    expect(badDate.body.error).toMatch(/not yyyy-mm-dd/i);

    const badAmount = await request(app.getHttpServer())
      .post('/api/banking/statements/import')
      .set(manager)
      .send({
        bankAccountId: bankA.id,
        filename: 'bad3.csv',
        statementDate: TODAY,
        content: 'value_date,transaction_date,reference,description,direction,amount,balance\n2026-11-01,,ref1,desc,debit,-5.00,\n',
      });
    expect(badAmount.status).toBe(400);
    expect(badAmount.body.error).toMatch(/positive decimal/i);
  });

  it('statement import dedupes the same file AND the same physical lines', async () => {
    const content = [
      'value_date,transaction_date,reference,description,direction,amount,balance',
      `${TODAY},,TRF-REF-1,TRANSFER FEE,debit,7.50,692.50`,
      `${TODAY},,DEP-1,CASH DEPOSIT,credit,500.00,1192.50`,
    ].join('\n');

    const first = await request(app.getHttpServer())
      .post('/api/banking/statements/import')
      .set(manager)
      .send({ bankAccountId: bankA.id, filename: 'stmt-a.csv', statementDate: TODAY, content });
    expect(first.status).toBe(201);
    expect(first.body.rowCount).toBe(2);
    expect(first.body.lines[0].matchStatus).toBe('unmatched');

    // same FILE content → 409 (file fingerprint)
    const sameFile = await request(app.getHttpServer())
      .post('/api/banking/statements/import')
      .set(manager)
      .send({ bankAccountId: bankA.id, filename: 'stmt-a-again.csv', statementDate: TODAY, content });
    expect(sameFile.status).toBe(409);
    expect(sameFile.body.error).toMatch(/already imported/i);

    // different file containing one DUPLICATE physical line → 409 (line identity)
    const overlapping = [
      'value_date,transaction_date,reference,description,direction,amount,balance',
      `${TODAY},,TRF-REF-1,TRANSFER FEE,debit,7.50,692.50`,
      `${TODAY},,CHK-9,CHEQUE,debit,50.00,642.50`,
    ].join('\n');
    const overlap = await request(app.getHttpServer())
      .post('/api/banking/statements/import')
      .set(manager)
      .send({ bankAccountId: bankA.id, filename: 'stmt-b.csv', statementDate: TODAY, content: overlapping });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toMatch(/line 2 .*was already imported/i);
  });

  it('match suggestions are deterministic evidence and never post', async () => {
    const statements = await request(app.getHttpServer())
      .get(`/api/banking/statements?bankAccountId=${bankA.id}`)
      .set(owner);
    expect(statements.status).toBe(200);
    const stmt = statements.body[0];
    // the 7.50 debit (money left the bank) matches the GL CREDIT on BNK-T1
    const feeLine = stmt.lines.find((l: { reference: string }) => l.reference === 'TRF-REF-1');
    expect(feeLine).toBeDefined();

    const suggestions = await request(app.getHttpServer())
      .get(`/api/banking/match/suggestions/${feeLine.id}`)
      .set(manager);
    expect(suggestions.status).toBe(200);
    expect(suggestions.body.length).toBeGreaterThanOrEqual(1);
    const best = suggestions.body[0];
    expect(best.amount).toBe('7.5000');
    expect(best.ruleName).toBe('exact-amount-opposite-direction-3day-window');
    // reference equality boosted the confidence
    expect(Number(best.confidence)).toBeGreaterThanOrEqual(0.9);
    // suggestions did NOT post or match anything
    const stillUnmatched = await request(app.getHttpServer())
      .get(`/api/banking/statements?bankAccountId=${bankA.id}`)
      .set(owner);
    const feeLineAfter = stillUnmatched.body[0].lines.find((l: { reference: string }) => l.reference === 'TRF-REF-1');
    expect(feeLineAfter.matchStatus).toBe('unmatched');
    expect(feeLineAfter.matchedAmount).toBe('0.0000');
  });

  it('manual match with direction/amount guards; unmatch restores state', async () => {
    const statements = await request(app.getHttpServer())
      .get(`/api/banking/statements?bankAccountId=${bankA.id}`)
      .set(owner);
    const stmt = statements.body[0];
    const feeLine = stmt.lines.find((l: { reference: string }) => l.reference === 'TRF-REF-1');
    const depositLine = stmt.lines.find((l: { reference: string }) => l.reference === 'DEP-1');

    const suggestions = await request(app.getHttpServer())
      .get(`/api/banking/match/suggestions/${feeLine.id}`)
      .set(manager);
    const target = suggestions.body[0];

    // matching a DEBIT statement line to a DEBIT journal line is rejected
    const wrongDirection = await request(app.getHttpServer())
      .post('/api/banking/match')
      .set(manager)
      .send({ statementLineId: depositLine.id, journalLineId: target.journalLineId, amount: '7.50' });
    expect(wrongDirection.status).toBe(400);
    expect(wrongDirection.body.error).toMatch(/directions must be opposite/i);

    // over-matching beyond the line amount is rejected
    const tooMuch = await request(app.getHttpServer())
      .post('/api/banking/match')
      .set(manager)
      .send({ statementLineId: feeLine.id, journalLineId: target.journalLineId, amount: '99.00' });
    expect(tooMuch.status).toBe(400);

    // a valid match succeeds
    const ok = await request(app.getHttpServer())
      .post('/api/banking/match')
      .set(manager)
      .send({ statementLineId: feeLine.id, journalLineId: target.journalLineId });
    expect(ok.status).toBe(201);
    expect(ok.body.amount).toBe('7.5000');

    // the statement line is matched
    const after = await request(app.getHttpServer())
      .get(`/api/banking/statements?bankAccountId=${bankA.id}`)
      .set(owner);
    const matched = after.body[0].lines.find((l: { reference: string }) => l.reference === 'TRF-REF-1');
    expect(matched.matchStatus).toBe('matched');
    expect(matched.matchedAmount).toBe('7.5000');

    // unmatch restores the unmatched state
    const unmatch = await request(app.getHttpServer())
      .post('/api/banking/match/unmatch')
      .set(manager)
      .send({ statementLineId: feeLine.id, journalLineId: target.journalLineId });
    expect(unmatch.status).toBe(201);
    const restored = await request(app.getHttpServer())
      .get(`/api/banking/statements?bankAccountId=${bankA.id}`)
      .set(owner);
    const unmatchedAgain = restored.body[0].lines.find((l: { reference: string }) => l.reference === 'TRF-REF-1');
    expect(unmatchedAgain.matchStatus).toBe('unmatched');

    // re-match for the reconciliation test
    await request(app.getHttpServer())
      .post('/api/banking/match')
      .set(manager)
      .send({ statementLineId: feeLine.id, journalLineId: target.journalLineId });
  });

  it('reconciliation finalization records explicit balances and difference', async () => {
    const recon = await request(app.getHttpServer())
      .post('/api/banking/reconciliations')
      .set(manager)
      .send({ bankAccountId: bankA.id, asOf: TODAY, notes: 'monthly close' });
    expect(recon.status).toBe(201);
    // GL: 1000 funded − 307.50 transferred out = 692.50
    expect(recon.body.glClosingBalance).toBe('692.5000');
    // statement closing balance from the last line: 1192.50 (includes the
    // unmatched 500 deposit) — the difference is EXPLICIT evidence
    expect(recon.body.statementClosingBalance).toBe('1192.5000');
    expect(recon.body.difference).toBe('-500.0000');
    expect(recon.body.status).toBe('finalized');

    const list = await request(app.getHttpServer())
      .get(`/api/banking/reconciliations?bankAccountId=${bankA.id}`)
      .set(owner);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
  });

  it('RBAC: banking reconciliation needs banking:reconcile; auditor reads only', async () => {
    const auditor = auth(fx.tenantA.users.auditor!.token!);
    const read = await request(app.getHttpServer()).get('/api/banking/accounts').set(auditor);
    expect(read.status).toBe(200);
    const match = await request(app.getHttpServer())
      .post('/api/banking/match')
      .set(auditor)
      .send({});
    expect(match.status).toBe(403);
    const cashier = auth(fx.tenantA.users.cashier!.token!);
    const accounts = await request(app.getHttpServer()).get('/api/banking/accounts').set(cashier);
    expect(accounts.status).toBe(403);
  });

  it('cross-tenant: tenant B sees no tenant A bank data', async () => {
    const b = auth(fx.tenantB.users.owner!.token!);
    const accounts = await request(app.getHttpServer()).get('/api/banking/accounts').set(b);
    expect(accounts.status).toBe(200);
    expect(accounts.body).toHaveLength(0);
    const statements = await request(app.getHttpServer()).get('/api/banking/statements').set(b);
    expect(statements.status).toBe(200);
    expect(statements.body).toHaveLength(0);
  });
});
