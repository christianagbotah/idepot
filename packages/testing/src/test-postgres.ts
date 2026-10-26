/**
 * Embedded PostgreSQL test harness.
 *
 * Modes:
 * - IDEPOT_TEST_PG_ADMIN_URL  -> use an external PostgreSQL (admin connection string)
 * - IDEPOT_TEST_PG_START=0    -> refuse to self-boot (fail fast; CI must provide a server)
 * - default                   -> boot an embedded PostgreSQL singleton (random free port)
 *
 * Roles: `postgres`/`postgres_test` is the admin role; `idepot_app`/`idepot_app_test`
 * is the least-privilege application role created idempotently (no TRUNCATE/CREATE).
 */
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

export const ADMIN_USER = 'postgres';
export const ADMIN_PASSWORD = 'postgres_test';
export const APP_USER = 'idepot_app';
export const APP_PASSWORD = 'idepot_app_test';

export interface TestPostgres {
  /** Connection string with admin (owner) role. */
  adminUrl: string;
  host: string;
  port: number;
  /** URL for a given database using the least-privilege app role. */
  appUrl(database: string): string;
  adminUrlFor(database: string): string;
  createDatabase(name: string): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  bootstrapRoles(): Promise<void>;
  stop(): Promise<void>;
}

let singleton: Promise<TestPostgres> | null = null;
let stopped = false;

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') return reject(new Error('no port'));
      srv.close(() => resolve(addr.port));
    });
  });
}

async function bootEmbedded(): Promise<TestPostgres> {
  if (process.env.IDEPOT_TEST_PG_START === '0') {
    throw new Error(
      'IDEPOT_TEST_PG_START=0 refuses to self-boot an embedded PostgreSQL. ' +
        'Provide IDEPOT_TEST_PG_ADMIN_URL or enable self-boot.',
    );
  }
  const dataRoot = process.env.IDEPOT_TEST_PG_DIR ?? '/home/z/my-project/.pg-test';
  const dataDir = join(dataRoot, `data-${randomUUID()}`);
  mkdirSync(dataDir, { recursive: true });
  const port = await getFreePort();

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: ADMIN_USER,
    password: ADMIN_PASSWORD,
    port,
    persistent: false,
    onError: (msgOrErr: unknown) =>
      process.stderr.write(`[embedded-pg] ${String(msgOrErr)}\n`),
  });
  await pg.initialise();
  await pg.start();

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      await pg.stop();
    } finally {
      if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
    }
  };
  process.on('beforeExit', () => void stop());
  process.on('SIGINT', () => void stop().then(() => process.exit(130)));
  process.on('SIGTERM', () => void stop().then(() => process.exit(143)));

  const host = '127.0.0.1';
  const adminUrl = `postgresql://${ADMIN_USER}:${ADMIN_PASSWORD}@${host}:${port}/postgres`;
  const tpg: TestPostgres = {
    adminUrl,
    host,
    port,
    appUrl: (db) => `postgresql://${APP_USER}:${APP_PASSWORD}@${host}:${port}/${db}`,
    adminUrlFor: (db) => `postgresql://${ADMIN_USER}:${ADMIN_PASSWORD}@${host}:${port}/${db}`,
    createDatabase: (name) => pg.createDatabase(name),
    dropDatabase: (name) => pg.dropDatabase(name),
    async bootstrapRoles() {
      const client = new Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
    CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';
  ELSE
    ALTER ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';
  END IF;
END $$;`);
      } finally {
        await client.end();
      }
    },
    stop,
  };
  await tpg.bootstrapRoles();
  return tpg;
}

async function connectExternal(url: string): Promise<TestPostgres> {
  const parsed = new URL(url);
  const base = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}`;
  const tpg: TestPostgres = {
    adminUrl: url,
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    appUrl: (db) => `${base}/${db}`,
    adminUrlFor: (db) => `${base}/${db}`,
    async createDatabase(name) {
      const c = new Client({ connectionString: url });
      await c.connect();
      try {
        const exists = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
        if (exists.rowCount === 0) await c.query(`CREATE DATABASE "${name}"`);
      } finally {
        await c.end();
      }
    },
    async dropDatabase(name) {
      const c = new Client({ connectionString: url });
      await c.connect();
      try {
        await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await c.end();
      }
    },
    async bootstrapRoles() {
      const c = new Client({ connectionString: url });
      await c.connect();
      try {
        await c.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
    CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';
  END IF;
END $$;`);
      } finally {
        await c.end();
      }
    },
    async stop() {
      /* external server: nothing to stop */
    },
  };
  await tpg.bootstrapRoles();
  return tpg;
}

/** Process-wide singleton. Safe to call concurrently; the first call boots. */
export function getTestPostgres(): Promise<TestPostgres> {
  if (!singleton) {
    const external = process.env.IDEPOT_TEST_PG_ADMIN_URL;
    singleton = external ? connectExternal(external) : bootEmbedded();
  }
  return singleton;
}
