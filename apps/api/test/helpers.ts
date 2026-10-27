import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { getTestPostgres, type TestPostgres } from '@idepot/testing';
import { runMigrations } from '../../../infra/migrations/runner.js';
import { hashPassword } from '@idepot/auth';
import type { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { PG_POOL, PG_ADMIN_POOL } from '../src/db/unit-of-work.js';

export interface TenantSeed {
  tenantId: string;
  slug: string;
  users: Record<string, { id: string; email: string; password: string; token?: string }>;
}

export interface ApiFixture {
  pg: TestPostgres;
  dbName: string;
  app: INestApplication;
  admin: Client;
  tenantA: TenantSeed;
  tenantB: TenantSeed;
  close(): Promise<void>;
}

export async function seedUser(
  admin: Client,
  tenantId: string,
  email: string,
  password: string,
  roles: string[],
): Promise<string> {
  const hash = await hashPassword(password);
  const res = await admin.query<{ id: string }>(
    `INSERT INTO app_user (tenant_id, email, password_hash, display_name, roles)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [tenantId, email, hash, email.split('@')[0] ?? email, roles],
  );
  return res.rows[0]!.id;
}

export async function seedTenant(admin: Client, slug: string): Promise<string> {
  const res = await admin.query<{ id: string }>(
    `INSERT INTO tenant (slug, name) VALUES ($1,$2) RETURNING id`,
    [slug, slug.toUpperCase()],
  );
  return res.rows[0]!.id;
}

export async function login(
  app: INestApplication,
  tenantSlug: string,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ tenantSlug, email, password });
  if (res.status !== 201) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { accessToken: string }).accessToken;
}

export async function createApiFixture(): Promise<ApiFixture> {
  const pg = await getTestPostgres();
  const dbName = `api_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await pg.createDatabase(dbName);
  const adminUrl = pg.adminUrlFor(dbName);
  await runMigrations({ adminUrl, appRolePassword: 'idepot_app_test' });

  process.env.IDEPOT_DATABASE_URL = pg.appUrl(dbName);
  process.env.IDEPOT_DATABASE_ADMIN_URL = adminUrl;
  process.env.IDEPOT_JWT_SECRET ??= 'test-secret-0123456789abcdef-0123456789';

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  const tenantAId = await seedTenant(admin, 'tenant-a');
  const tenantBId = await seedTenant(admin, 'tenant-b');

  const tenantA: TenantSeed = {
    tenantId: tenantAId,
    slug: 'tenant-a',
    users: {
      owner: { id: '', email: 'owner@tenant-a.test', password: 'Owner-Pass-1', token: '' },
      admin: { id: '', email: 'admin@tenant-a.test', password: 'Admin-Pass-1', token: '' },
      manager: { id: '', email: 'manager@tenant-a.test', password: 'Manager-Pass-1', token: '' },
      cashier: { id: '', email: 'cashier@tenant-a.test', password: 'Cashier-Pass-1', token: '' },
      auditor: { id: '', email: 'auditor@tenant-a.test', password: 'Auditor-Pass-1', token: '' },
    },
  };
  const tenantB: TenantSeed = {
    tenantId: tenantBId,
    slug: 'tenant-b',
    users: {
      owner: { id: '', email: 'owner@tenant-b.test', password: 'Owner-Pass-1', token: '' },
    },
  };

  for (const [role, u] of Object.entries(tenantA.users)) {
    u.id = await seedUser(admin, tenantAId, u.email, u.password, [role]);
  }
  tenantB.users.owner!.id = await seedUser(
    admin,
    tenantBId,
    tenantB.users.owner!.email,
    tenantB.users.owner!.password,
    ['owner'],
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  // mirror main.ts bootstrap configuration
  app.setGlobalPrefix('api');
  await app.init();

  for (const u of Object.values(tenantA.users)) {
    u.token = await login(app, 'tenant-a', u.email, u.password);
  }
  tenantB.users.owner!.token = await login(
    app,
    'tenant-b',
    tenantB.users.owner!.email,
    tenantB.users.owner!.password,
  );

  return {
    pg,
    dbName,
    app,
    admin,
    tenantA,
    tenantB,
    async close() {
      // end pools gracefully BEFORE tearing down the embedded server
      const pool = app.get(PG_POOL) as Pool;
      const adminPool = app.get(PG_ADMIN_POOL) as Pool;
      await app.close();
      await Promise.all([pool.end().catch(() => undefined), adminPool.end().catch(() => undefined)]);
      await admin.end();
      await pg.dropDatabase(dbName).catch(() => undefined);
    },
  };
}
