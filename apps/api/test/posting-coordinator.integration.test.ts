/**
 * Posting Coordinator / UoW atomicity reference test (ROADMAP exit criterion:
 * "posting-coordinator reference test proves all-or-nothing rollback").
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('posting coordinator — all-or-nothing (ADR-0001)', () => {
  let fx: ApiFixture;
  const tokenOf = () => fx.tenantA.users.owner!.token!;

  beforeAll(async () => {
    fx = await createApiFixture();
  }, 120_000);
  afterAll(async () => {
    await fx.close();
  });

  async function snapshot(): Promise<{ docs: number; audits: number; outbox: number }> {
    const q = async (sql: string) =>
      Number((await fx.admin.query<{ n: string }>(sql)).rows[0]!.n);
    return {
      docs: await q('SELECT count(*)::text n FROM sample_document'),
      audits: await q('SELECT count(*)::text n FROM audit_event'),
      outbox: await q('SELECT count(*)::text n FROM outbox_event'),
    };
  }

  it('commits document + audit + outbox together on success', async () => {
    const before = await snapshot();
    const res = await request(fx.app.getHttpServer())
      .post('/api/sample-documents')
      .set('Authorization', `Bearer ${tokenOf()}`)
      .send({ code: 'DOC-001', totalAmount: '123.4567' });
    expect(res.status).toBe(201);
    const after = await snapshot();
    expect(after.docs - before.docs).toBe(1);
    expect(after.audits - before.audits).toBe(1);
    expect(after.outbox - before.outbox).toBe(1);
  });

  it('rolls back EVERYTHING when a failure occurs after partial writes', async () => {
    const before = await snapshot();
    const res = await request(fx.app.getHttpServer())
      .post('/api/sample-documents')
      .set('Authorization', `Bearer ${tokenOf()}`)
      .send({ code: 'DOC-FAIL', totalAmount: '999.0000', simulateFailureAfterWrites: true });
    expect(res.status).toBe(500);
    const after = await snapshot();
    // zero partial rows: the injected failure must not leave document/audit/outbox rows
    expect(after.docs).toBe(before.docs);
    expect(after.audits).toBe(before.audits);
    expect(after.outbox).toBe(before.outbox);
  });

  it('rejects writes attempted outside a UnitOfWork (repository-layer enforcement)', async () => {
    // repository called without an active UoW must throw NoActiveTransactionError
    const { WarehouseRepository } = await import('../src/warehouse/warehouse.repository.js');
    const repo = new WarehouseRepository();
    await expect(repo.create({ code: 'WH-X', name: 'X' })).rejects.toThrow(
      /No active UnitOfWork transaction/i,
    );
  });
});
