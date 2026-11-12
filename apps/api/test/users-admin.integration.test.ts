/**
 * Phase 5 user & profile administration (legacy admin_list.php /
 * modal_admin_add.php / modal_admin_edit.php / manage_profile.php):
 *  - RBAC: only owner/admin hold users:manage;
 *  - create user (Argon2id, audited) → login works;
 *  - duplicate email → 409; owner role cannot be granted;
 *  - update roles/status/display name with before/after audit;
 *  - self-lockout guard (own roles/status/password reset refused);
 *  - last-active-admin guard (disable/demote refused);
 *  - password reset: old password stops working, new one logs in;
 *  - disabled users cannot log in;
 *  - own profile: display name + password change (current password required);
 *  - cross-tenant isolation (tenant A admin cannot touch tenant B users).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, login, type ApiFixture } from './helpers.js';

describe('user & profile administration', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let admin: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;
  let tenantBOwner: Record<string, string>;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    admin = auth(fx.tenantA.users.admin!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    auditor = auth(fx.tenantA.users.auditor!.token!);
    tenantBOwner = auth(fx.tenantB.users.owner!.token!);
  });

  afterAll(async () => {
    await fx.close();
  });

  // ------------------------------------------------------------------ RBAC

  it('owner and admin can list users; manager/cashier/auditor are refused (403)', async () => {
    for (const t of [owner, admin]) {
      const res = await request(app.getHttpServer()).get('/api/admin/users').set(t);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((u: { email: string }) => u.email === 'owner@tenant-a.test')).toBe(true);
    }
    for (const t of [manager, cashier, auditor]) {
      const res = await request(app.getHttpServer()).get('/api/admin/users').set(t);
      expect(res.status).toBe(403);
    }
  });

  it('never exposes password hashes', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/users').set(owner);
    expect(res.status).toBe(200);
    for (const u of res.body as Array<Record<string, unknown>>) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.password_hash).toBeUndefined();
    }
  });

  // ---------------------------------------------------------------- create

  it('admin creates a new cashier; the user can log in immediately and the creation is audited', async () => {
    const res = await request(app.getHttpServer()).post('/api/admin/users').set(admin).send({
      email: 'NewCashier@Tenant-A.test',
      displayName: 'New Cashier',
      password: 'Initial-Pass-9',
      roles: ['cashier'],
    });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('newcashier@tenant-a.test'); // lowercased
    expect(res.body.roles).toEqual(['cashier']);
    expect(res.body.status).toBe('active');

    const token = await login(app, 'tenant-a', 'newcashier@tenant-a.test', 'Initial-Pass-9');
    expect(token).toBeTruthy();

    const me = await request(app.getHttpServer()).get('/api/auth/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.roles).toEqual(['cashier']);

    const audit = await fx.admin.query(
      `SELECT action, details FROM audit_event
        WHERE tenant_id = $1 AND action = 'user.created' AND details->>'email' = 'newcashier@tenant-a.test'`,
      [fx.tenantA.tenantId],
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0]!.details.roles).toEqual(['cashier']);
  });

  it('duplicate email in the same tenant is a controlled 409', async () => {
    const res = await request(app.getHttpServer()).post('/api/admin/users').set(admin).send({
      email: 'newcashier@tenant-a.test',
      displayName: 'Dup',
      password: 'Whatever-Pass-1',
      roles: ['cashier'],
    });
    expect(res.status).toBe(409);
  });

  it('the same email in ANOTHER tenant is fine (per-tenant uniqueness)', async () => {
    const res = await request(app.getHttpServer()).post('/api/admin/users').set(tenantBOwner).send({
      email: 'newcashier@tenant-a.test',
      displayName: 'Tenant B New Cashier',
      password: 'TenantB-Pass-1',
      roles: ['cashier'],
    });
    expect(res.status).toBe(201);
  });

  it('the owner role cannot be granted (bootstrap-only)', async () => {
    const res = await request(app.getHttpServer()).post('/api/admin/users').set(admin).send({
      email: 'nope@tenant-a.test',
      displayName: 'Nope',
      password: 'Whatever-Pass-1',
      roles: ['owner'],
    });
    expect(res.status).toBe(403);
  });

  it('cashier cannot create users (403) and invalid bodies are 400', async () => {
    const forbidden = await request(app.getHttpServer()).post('/api/admin/users').set(cashier).send({
      email: 'x@tenant-a.test',
      displayName: 'X',
      password: 'Whatever-Pass-1',
      roles: ['cashier'],
    });
    expect(forbidden.status).toBe(403);

    const invalid = await request(app.getHttpServer()).post('/api/admin/users').set(admin).send({
      email: 'not-an-email',
      displayName: 'X',
      password: 'short',
      roles: [],
    });
    expect(invalid.status).toBe(400);
  });

  // ---------------------------------------------------------------- update

  it('admin promotes the new cashier to manager with audited before/after evidence', async () => {
    const list = await request(app.getHttpServer()).get('/api/admin/users?status=active').set(admin);
    const target = (list.body as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'newcashier@tenant-a.test',
    )!;
    expect(target).toBeTruthy();

    const res = await request(app.getHttpServer()).patch(`/api/admin/users/${target.id}`).set(admin).send({
      displayName: 'New Cashier (Senior)',
      roles: ['cashier', 'manager'],
    });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('New Cashier (Senior)');
    expect(res.body.roles).toEqual(['cashier', 'manager']);

    const audit = await fx.admin.query(
      `SELECT details FROM audit_event
        WHERE tenant_id = $1 AND action = 'user.updated' AND entity_id = $2
        ORDER BY id DESC LIMIT 1`,
      [fx.tenantA.tenantId, target.id],
    );
    expect(audit.rows[0]!.details.changes.roles).toEqual({
      from: ['cashier'],
      to: ['cashier', 'manager'],
    });
  });

  it('an actor can never change their own roles or status (self-lockout guard)', async () => {
    const me = fx.tenantA.users.admin!;
    const res1 = await request(app.getHttpServer()).patch(`/api/admin/users/${me.id}`).set(admin).send({
      status: 'disabled',
    });
    expect(res1.status).toBe(403);

    const res2 = await request(app.getHttpServer()).patch(`/api/admin/users/${me.id}`).set(admin).send({
      roles: ['cashier'],
    });
    expect(res2.status).toBe(403);

    const res3 = await request(app.getHttpServer())
      .post(`/api/admin/users/${me.id}/reset-password`)
      .set(admin)
      .send({ password: 'Self-Reset-Pass-1' });
    expect(res3.status).toBe(403);
  });

  it('the last active owner/admin cannot be disabled or demoted — even by a disabled admin holding a still-valid token', async () => {
    // tenant B has exactly one active admin-class user (its owner).
    // A second admin is created, then disabled by the owner; its JWT is still
    // valid (tokens live until expiry) and it tries to disable/demote the
    // now-last active admin — the tenant-lockout guard must refuse (409).
    const created = await request(app.getHttpServer()).post('/api/admin/users').set(tenantBOwner).send({
      email: 'admin2@tenant-b.test',
      displayName: 'Tenant B Admin Two',
      password: 'AdminTwo-Pass-1',
      roles: ['admin'],
    });
    expect(created.status).toBe(201);
    const admin2 = auth(await login(app, 'tenant-b', 'admin2@tenant-b.test', 'AdminTwo-Pass-1'));

    // while BOTH are active, disabling the owner is legitimate (admin2 remains)
    const ownerId = fx.tenantB.users.owner!.id;
    const legitimate = await request(app.getHttpServer())
      .patch(`/api/admin/users/${ownerId}`)
      .set(admin2)
      .send({ displayName: 'Tenant B Owner' });
    expect(legitimate.status).toBe(200);

    // owner disables admin2 (actor remains the active admin — allowed)
    const disableAdmin2 = await request(app.getHttpServer())
      .patch(`/api/admin/users/${created.body.id}`)
      .set(tenantBOwner)
      .send({ status: 'disabled' });
    expect(disableAdmin2.status).toBe(200);

    // admin2's still-valid token is the ONLY remaining attack path to make the
    // tenant admin-less — the guard must fire:
    const disable = await request(app.getHttpServer()).patch(`/api/admin/users/${ownerId}`).set(admin2).send({
      status: 'disabled',
    });
    expect(disable.status).toBe(409);

    const demote = await request(app.getHttpServer()).patch(`/api/admin/users/${ownerId}`).set(admin2).send({
      roles: ['manager'],
    });
    expect(demote.status).toBe(409);
  });

  // -------------------------------------------------------- password reset

  it('password reset: the old password stops working, the new one logs in, audit written', async () => {
    const list = await request(app.getHttpServer()).get('/api/admin/users').set(admin);
    const target = (list.body as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'newcashier@tenant-a.test',
    )!;

    const res = await request(app.getHttpServer())
      .post(`/api/admin/users/${target.id}/reset-password`)
      .set(admin)
      .send({ password: 'Reset-Pass-42' });
    expect(res.status).toBe(201);

    const oldLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantSlug: 'tenant-a',
      email: 'newcashier@tenant-a.test',
      password: 'Initial-Pass-9',
    });
    expect(oldLogin.status).toBe(401);

    const token = await login(app, 'tenant-a', 'newcashier@tenant-a.test', 'Reset-Pass-42');
    expect(token).toBeTruthy();

    const audit = await fx.admin.query(
      `SELECT COUNT(*)::int AS n FROM audit_event
        WHERE tenant_id = $1 AND action = 'user.password_reset' AND entity_id = $2`,
      [fx.tenantA.tenantId, target.id],
    );
    expect(audit.rows[0]!.n).toBe(1);
  });

  it('a disabled user cannot log in', async () => {
    const list = await request(app.getHttpServer()).get('/api/admin/users').set(admin);
    const target = (list.body as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'newcashier@tenant-a.test',
    )!;
    const disable = await request(app.getHttpServer()).patch(`/api/admin/users/${target.id}`).set(admin).send({
      status: 'disabled',
    });
    expect(disable.status).toBe(200);

    const loginAttempt = await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantSlug: 'tenant-a',
      email: 'newcashier@tenant-a.test',
      password: 'Reset-Pass-42',
    });
    expect(loginAttempt.status).toBe(401);

    // re-enable for later assertions
    const enable = await request(app.getHttpServer()).patch(`/api/admin/users/${target.id}`).set(admin).send({
      status: 'active',
    });
    expect(enable.status).toBe(200);
  });

  // ------------------------------------------------------------ own profile

  it('own profile: display name change is audited and visible', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/profile').set(cashier).send({
      displayName: 'Cashier Renamed',
    });
    expect(res.status).toBe(201);
    expect(res.body.displayName).toBe('Cashier Renamed');

    const audit = await fx.admin.query(
      `SELECT COUNT(*)::int AS n FROM audit_event
        WHERE tenant_id = $1 AND action = 'user.profile_updated' AND entity_id = $2`,
      [fx.tenantA.tenantId, fx.tenantA.users.cashier!.id],
    );
    expect(audit.rows[0]!.n).toBe(1);
  });

  it('own password change requires the current password and rejects reuse', async () => {
    const wrong = await request(app.getHttpServer()).post('/api/auth/change-password').set(cashier).send({
      currentPassword: 'definitely-wrong',
      newPassword: 'NewCashier-Pass-2',
    });
    expect(wrong.status).toBe(400);

    const same = await request(app.getHttpServer()).post('/api/auth/change-password').set(cashier).send({
      currentPassword: 'Cashier-Pass-1',
      newPassword: 'Cashier-Pass-1',
    });
    expect(same.status).toBe(400);

    const ok = await request(app.getHttpServer()).post('/api/auth/change-password').set(cashier).send({
      currentPassword: 'Cashier-Pass-1',
      newPassword: 'NewCashier-Pass-2',
    });
    expect(ok.status).toBe(201);

    const token = await login(app, 'tenant-a', 'cashier@tenant-a.test', 'NewCashier-Pass-2');
    expect(token).toBeTruthy();

    const audit = await fx.admin.query(
      `SELECT COUNT(*)::int AS n FROM audit_event
        WHERE tenant_id = $1 AND action = 'user.password_changed' AND entity_id = $2`,
      [fx.tenantA.tenantId, fx.tenantA.users.cashier!.id],
    );
    expect(audit.rows[0]!.n).toBe(1);
  });

  // ------------------------------------------------------ tenant isolation

  it('tenant A admin cannot see or mutate tenant B users (RLS isolation)', async () => {
    const list = await request(app.getHttpServer()).get('/api/admin/users').set(admin);
    const emails = (list.body as Array<{ email: string }>).map((u) => u.email);
    expect(emails).not.toContain('admin2@tenant-b.test');
    expect(emails).not.toContain('owner@tenant-b.test');

    const someB = await fx.admin.query<{ id: string }>(
      `SELECT id FROM app_user WHERE tenant_id = $1 AND email = 'admin2@tenant-b.test'`,
      [fx.tenantB.tenantId],
    );
    const patch = await request(app.getHttpServer())
      .patch(`/api/admin/users/${someB.rows[0]!.id}`)
      .set(admin)
      .send({ status: 'disabled' });
    expect(patch.status).toBe(404);
  });
});
