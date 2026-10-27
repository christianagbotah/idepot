/**
 * RBAC authorization matrix + cross-tenant access impossibility
 * (ROADMAP Phase 1 exit criterion).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { ApiFixture } from './helpers.js';
import { createApiFixture } from './helpers.js';

interface MatrixCase {
  role: keyof ApiFixture['tenantA']['users'];
  method: 'get' | 'post' | 'patch';
  path: 'warehouses' | 'internal/change-feed' | 'auth/devices' | 'sample-documents';
  body?: Record<string, unknown>;
  expect: number;
}

const MATRIX: MatrixCase[] = [
  // warehouse:write
  { role: 'owner', method: 'post', path: 'warehouses', body: { code: 'WH-O', name: 'Owner WH' }, expect: 201 },
  { role: 'admin', method: 'post', path: 'warehouses', body: { code: 'WH-A', name: 'Admin WH' }, expect: 201 },
  { role: 'manager', method: 'post', path: 'warehouses', body: { code: 'WH-M', name: 'Manager WH' }, expect: 201 },
  { role: 'cashier', method: 'post', path: 'warehouses', body: { code: 'WH-C', name: 'Cashier WH' }, expect: 403 },
  { role: 'auditor', method: 'post', path: 'warehouses', body: { code: 'WH-V', name: 'Auditor WH' }, expect: 403 },
  // warehouse:read
  { role: 'owner', method: 'get', path: 'warehouses', expect: 200 },
  { role: 'manager', method: 'get', path: 'warehouses', expect: 200 },
  { role: 'cashier', method: 'get', path: 'warehouses', expect: 200 },
  { role: 'auditor', method: 'get', path: 'warehouses', expect: 200 },
  // outbox:read (change feed)
  { role: 'owner', method: 'get', path: 'internal/change-feed', expect: 200 },
  { role: 'auditor', method: 'get', path: 'internal/change-feed', expect: 200 },
  { role: 'manager', method: 'get', path: 'internal/change-feed', expect: 403 },
  { role: 'cashier', method: 'get', path: 'internal/change-feed', expect: 403 },
  // device:register
  { role: 'cashier', method: 'post', path: 'auth/devices', body: { deviceCode: 'POS-C1', platform: 'windows' }, expect: 201 },
  { role: 'auditor', method: 'post', path: 'auth/devices', body: { deviceCode: 'POS-V1', platform: 'windows' }, expect: 403 },
  // sample:post
  { role: 'manager', method: 'post', path: 'sample-documents', body: { code: 'SD-M', totalAmount: '10.0000' }, expect: 201 },
  { role: 'cashier', method: 'post', path: 'sample-documents', body: { code: 'SD-C', totalAmount: '10.0000' }, expect: 403 },
  { role: 'auditor', method: 'post', path: 'sample-documents', body: { code: 'SD-V', totalAmount: '10.0000' }, expect: 403 },
];

describe('RBAC authorization matrix', () => {
  let fx: ApiFixture;

  beforeAll(async () => {
    fx = await createApiFixture();
  }, 120_000);
  afterAll(async () => {
    await fx.close();
  });

  it.each(MATRIX)('$role $method /$path -> $expect', async (c) => {
    const user = fx.tenantA.users[c.role]!;
    const res = await request(fx.app.getHttpServer())
      [c.method](`/api/${c.path}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(c.body ?? {});
    expect(res.status).toBe(c.expect);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(fx.app.getHttpServer()).get('/api/warehouses');
    expect(res.status).toBe(401);
  });

  it('rejects malformed tokens', async () => {
    const res = await request(fx.app.getHttpServer())
      .get('/api/warehouses')
      .set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });

  it('forbids privilege escalation via unknown roles', async () => {
    // seed a user with a bogus role; must behave like no permissions
    const { seedUser } = await import('./helpers.js');
    const id = await seedUser(fx.admin, fx.tenantA.tenantId, 'ghost@tenant-a.test', 'Ghost-Pass-1', ['superadmin']);
    void id;
    const { login } = await import('./helpers.js');
    const token = await login(fx.app, 'tenant-a', 'ghost@tenant-a.test', 'Ghost-Pass-1');
    const res = await request(fx.app.getHttpServer())
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'WH-G', name: 'Ghost WH' });
    expect(res.status).toBe(403);
  });
});

describe('cross-tenant access impossibility (RLS + scoping)', () => {
  let fx: ApiFixture;
  let warehouseAId = '';

  beforeAll(async () => {
    fx = await createApiFixture();
    const res = await request(fx.app.getHttpServer())
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${fx.tenantA.users.owner!.token}`)
      .send({ code: 'WH-A1', name: 'Tenant A Warehouse' });
    warehouseAId = (res.body as { id: string }).id;
  }, 120_000);
  afterAll(async () => {
    await fx.close();
  });

  it('tenant B cannot read tenant A warehouse (404 semantics)', async () => {
    const res = await request(fx.app.getHttpServer())
      .get(`/api/warehouses/${warehouseAId}`)
      .set('Authorization', `Bearer ${fx.tenantB.users.owner!.token}`);
    expect(res.status).toBe(404);
  });

  it('tenant B cannot mutate tenant A warehouse (404 semantics)', async () => {
    const res = await request(fx.app.getHttpServer())
      .patch(`/api/warehouses/${warehouseAId}`)
      .set('Authorization', `Bearer ${fx.tenantB.users.owner!.token}`)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it('tenant B list excludes tenant A warehouses', async () => {
    const res = await request(fx.app.getHttpServer())
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${fx.tenantB.users.owner!.token}`);
    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it('tenant A still sees its own warehouse', async () => {
    const res = await request(fx.app.getHttpServer())
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${fx.tenantA.users.owner!.token}`);
    expect(res.status).toBe(200);
    const body = res.body as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toContain(warehouseAId);
  });

  it('audit trail records tenant-scoped actor actions', async () => {
    const res = await fx.admin.query(
      `SELECT action, entity_type FROM audit_event WHERE tenant_id = $1 ORDER BY occurred_at`,
      [fx.tenantA.tenantId],
    );
    const actions = res.rows.map((r) => r.action as string);
    expect(actions).toContain('auth.login');
    expect(actions).toContain('warehouse.created');
  });
});
