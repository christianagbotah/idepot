/**
 * Embedded PostgreSQL test harness.
 *
 * Modes:
 * - IDEPOT_TEST_PG_ADMIN_URL  -> use an external PostgreSQL (admin connection string)
 * - IDEPOT_TEST_PG_START=0    -> refuse to self-boot (fail fast; CI must provide a server)
 * - default                   -> boot an embedded PostgreSQL singleton (probed
 *                               free port, retried when parallel workers lose
 *                               the bind race)
 *
 * Roles: `postgres`/`postgres_test` is the admin role; `idepot_app`/`idepot_app_test`
 * is the least-privilege application role created idempotently (no TRUNCATE/CREATE).
 */
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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

/**
 * Locate the monorepo root by walking up from this module until a package.json
 * declaring "workspaces" is found. Resolved at RUNTIME from the module's own
 * location — never hardcoded — so the harness works on any machine/CI runner
 * and both when executed from src (vitest source alias) and from dist.
 */
function findMonorepoRoot(): string {
  let dir = dirname(fileURLToPath(new URL('.', import.meta.url)));
  while (true) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown };
        if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) return dir;
      } catch {
        /* malformed package.json — keep walking up */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `monorepo root not found: no package.json with "workspaces" above ${dir}`,
      );
    }
    dir = parent;
  }
}

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

/** How many probe -> initdb -> start attempts before giving up. */
const MAX_START_ATTEMPTS = 5;

/**
 * Postgres itself refuses `port: 0` ("0 is outside the valid range for
 * parameter \"port\" (1 .. 65535)"), so embedded-postgres cannot ask the OS
 * for an atomic, collision-free port assignment. Probing a free port and
 * closing the probe socket BEFORE postgres binds is therefore a classic
 * TOCTOU race: parallel vitest forks (pool: 'forks', fileParallelism: true)
 * can probe the very same port, and the loser dies with "FATAL: could not
 * create any TCP/IP sockets". These stderr signatures identify that lost
 * race so it can be retried on a fresh port instead of failing the run.
 */
const PORT_COLLISION =
  /could not create any TCP\/IP sockets|address already in use|already running on port/i;

/**
 * embedded-postgres registers every constructed instance in a module-level
 * set that its async exit hook stops on process exit. After a failed start()
 * the child process is already gone but the registration is not — stop()
 * would then await an 'exit' event that has already fired and hang the worker
 * at exit. Clearing the dangling reference makes stop() short-circuit on its
 * own "nothing to stop" guard, so discarded retry attempts stay invisible to
 * the exit hook.
 */
function forgetFailedInstance(pg: EmbeddedPostgres): void {
  (pg as unknown as { process?: unknown }).process = undefined;
}

async function bootEmbedded(): Promise<TestPostgres> {
  if (process.env.IDEPOT_TEST_PG_START === '0') {
    throw new Error(
      'IDEPOT_TEST_PG_START=0 refuses to self-boot an embedded PostgreSQL. ' +
        'Provide IDEPOT_TEST_PG_ADMIN_URL or enable self-boot.',
    );
  }
  // Disposable scratch space inside the repo (gitignored). Override with
  // IDEPOT_TEST_PG_DIR. CI runners check the repo out at an arbitrary path,
  // so this must be resolved at runtime, never hardcoded.
  const dataRoot = process.env.IDEPOT_TEST_PG_DIR ?? join(findMonorepoRoot(), '.pg-test');

  // Postgres rejects port 0, so the OS cannot atomically assign us a port
  // (see the note above PORT_COLLISION). Instead: probe a free port, start
  // postgres on it, and if another worker grabbed the port in between, tear
  // the attempt down and retry on a NEW port. Two simultaneously-starting
  // instances thus converge on different ports instead of colliding.
  let winner: { pg: EmbeddedPostgres; port: number; dataDir: string } | undefined;
  let lastCollision: string | undefined;

  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    const port = await getFreePort();
    const dataDir = join(dataRoot, `data-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });

    // embedded-postgres funnels ALL child-process output (stdout AND stderr,
    // initdb AND postgres) through onLog, and start() rejects with NO error
    // object when the server exits early — which is why a bind failure used
    // to surface as "Unknown Error: undefined". Buffering the output is the
    // only way to recover the underlying "FATAL: ..." text for classification
    // and for the error message of a genuine failure.
    let output = '';
    const pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: ADMIN_USER,
      password: ADMIN_PASSWORD,
      port,
      persistent: false,
      onLog: (message: string) => {
        output += message;
        process.stderr.write(`[embedded-pg] ${message}`);
      },
      onError: (msgOrErr: unknown) =>
        process.stderr.write(`[embedded-pg] ${String(msgOrErr)}\n`),
    });

    try {
      await pg.initialise();
      await pg.start();
      winner = { pg, port, dataDir };
      break;
    } catch (err) {
      // The child is already dead at this point (start() only rejects on
      // early exit); detach it, then discard this attempt's data directory.
      forgetFailedInstance(pg);
      if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });

      // Prefer the buffered postgres output; fall back to the thrown error
      // (initdb failures reject with a real Error, start() rejects with
      // `undefined`). Either way the UNDERLYING message must survive.
      const detail =
        output.trim() ||
        (err instanceof Error ? err.message : '') ||
        'no diagnostics captured';
      if (!PORT_COLLISION.test(output)) {
        throw new Error(
          `embedded PostgreSQL failed to start (attempt ${attempt}/${MAX_START_ATTEMPTS}, ` +
            `port ${port}, data dir ${dataDir}): ${detail}`,
        );
      }
      // Lost the port race to a parallel worker — retry on a fresh port.
      lastCollision = `port ${port}: ${detail}`;
    }
  }

  if (!winner) {
    throw new Error(
      `embedded PostgreSQL lost the ephemeral-port race ${MAX_START_ATTEMPTS} times in a ` +
        `row (last: ${lastCollision ?? 'no diagnostics captured'}); ` +
        'are parallel workers saturating the free-port range?',
    );
  }

  const { pg, port, dataDir } = winner;

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
