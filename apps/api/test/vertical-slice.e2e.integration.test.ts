/**
 * Phase 1 vertical slice E2E: login -> authenticated tenant context ->
 * tenant-scoped CRUD -> audit events -> change-feed projection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { ApiFixture } from './helpers.js';
import { createApiFixture } from './helpers.js';

describe('vertical slice: login → tenant context → CRUD → audit → change-feed', () => {
  let fx: ApiFixture;
  const owner = () => fx.tenantA.users.owner!;
  let token = '';
  let warehouseId = '';

  beforeAll(async () => {
    fx = await createApiFixture();
    token = owner().token!;
  }, 120_000);
  afterAll(async () => {
    await fx.close();
  });

  it('1. login issues tokens and binds tenant context', async () => {
    const res = await request(fx.app.getHttpServer()).post('/api/auth/login').send({
      tenantSlug: 'tenant-a',
      email: owner().email,
      password: owner().password,
      deviceCode: 'POS-001',
      platform: 'windows',
    });
    expect(res.status).toBe(201);
    const body = res.body as { accessToken: string; user: { tenantId: string; roles: string[] } };
    expect(body.accessToken).toBeTruthy();
    expect(body.user.tenantId).toBe(fx.tenantA.tenantId);
    expect(body.user.roles).toContain('owner');
  });

  it('2. wrong password is rejected without enumeration', async () => {
    const res = await request(fx.app.getHttpServer()).post('/api/auth/login').send({
      tenantSlug: 'tenant-a',
      email: owner().email,
      password: 'Wrong-Pass-99',
    });
    expect(res.status).toBe(401);
  });

  it('3. refresh flow issues a new pair', async () => {
    const loginRes = await request(fx.app.getHttpServer()).post('/api/auth/login').send({
      tenantSlug: 'tenant-a',
      email: owner().email,
      password: owner().password,
    });
    const refreshToken = (loginRes.body as { refreshToken: string }).refreshToken;
    const res = await request(fx.app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(201);
    expect((res.body as { accessToken: string }).accessToken).toBeTruthy();
  });

  it('4. tenant-scoped create -> read -> update', async () => {
    const created = await request(fx.app.getHttpServer())
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'WH-CENTRAL', name: 'Central Store', isActive: true });
    expect(created.status).toBe(201);
    warehouseId = (created.body as { id: string }).id;

    const list = await request(fx.app.getHttpServer())
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect((list.body as { total: number }).total).toBe(1);

    const updated = await request(fx.app.getHttpServer())
      .patch(`/api/warehouses/${warehouseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Central Store HQ' });
    expect(updated.status).toBe(200);
    expect((updated.body as { name: string }).name).toBe('Central Store HQ');

    // validation path: bad code shape -> 400
    const bad = await request(fx.app.getHttpServer())
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'x', name: 'Too small code' });
    expect(bad.status).toBe(400);
  });

  it('5. audit events were written inside the same transactions', async () => {
    const res = await fx.admin.query(
      `SELECT action, entity_type, actor_user_id FROM audit_event
       WHERE tenant_id = $1 ORDER BY occurred_at`,
      [fx.tenantA.tenantId],
    );
    const actions = res.rows.map((r) => r.action as string);
    expect(actions).toContain('auth.login');
    expect(actions).toContain('warehouse.created');
    expect(actions).toContain('warehouse.updated');
  });

  it('6. change-feed exposes the committed facts; ack projects them', async () => {
    const feed = await request(fx.app.getHttpServer())
      .get('/api/internal/change-feed')
      .set('Authorization', `Bearer ${token}`);
    expect(feed.status).toBe(200);
    const items = (feed.body as { items: { id: string; type: string; status: string }[] }).items;
    const types = items.map((i) => i.type);
    expect(types).toContain('WarehouseCreated');
    expect(types).toContain('WarehouseUpdated');

    const first = items[0]!;
    const ack = await request(fx.app.getHttpServer())
      .post('/api/internal/change-feed/ack')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [first.id] });
    expect(ack.status).toBe(201);
    expect((ack.body as { acked: string[] }).acked).toEqual([first.id]);

    const feed2 = await request(fx.app.getHttpServer())
      .get('/api/internal/change-feed')
      .set('Authorization', `Bearer ${token}`);
    const after = (feed2.body as { items: { id: string; status: string }[] }).items;
    expect(after.find((i) => i.id === first.id)?.status).toBe('processed');
  });

  it('7. device registration works and is tenant-scoped', async () => {
    const res = await request(fx.app.getHttpServer())
      .post('/api/auth/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceCode: 'POS-001', platform: 'windows' });
    expect(res.status).toBe(201);
    const devices = await fx.admin.query(
      `SELECT device_code FROM device WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
    expect(devices.rows.map((r) => r.device_code)).toContain('POS-001');
  });
});
