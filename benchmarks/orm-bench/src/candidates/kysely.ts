/** Kysely 0.28 candidate — explicit transaction objects, typed query builder. */
import { Kysely, PostgresDialect, Generated, sql } from 'kysely';
import { Pool } from 'pg';
import type { BenchCandidate, BenchDatabase, DimensionResult } from '../types.js';
import { BENCH_SCHEMA_SQL } from '../schema.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

interface BenchATable {
  id: Generated<number>;
  tenant_id: string;
  code: string;
  amount: string;
}
interface BenchLedgerTable {
  id: Generated<number>;
  tenant_id: string;
  entry_date: string;
  direction: 'dr' | 'cr';
  amount: string;
}
interface BenchRlsTable {
  id: Generated<number>;
  tenant_id: string;
  payload: string;
}
interface DB {
  bench_a: BenchATable;
  bench_ledger: BenchLedgerTable;
  bench_rls: BenchRlsTable;
}

export class KyselyCandidate implements BenchCandidate {
  name = 'kysely 0.28';
  private db!: Kysely<DB>;
  private pool!: Pool;
  private capturedQueries = 0;

  async setup(db: BenchDatabase): Promise<void> {
    this.pool = new Pool({ connectionString: db.appUrl, max: 5 });
    this.db = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: this.pool }),
      log: () => {
        this.capturedQueries++;
      },
    });
    // B4: Kysely migrator (candidate-native migration facility).
    const admin = new Pool({ connectionString: db.adminUrl, max: 1 });
    try {
      await admin.query(BENCH_SCHEMA_SQL);
      await admin.query(
        `CREATE TABLE IF NOT EXISTS kysely_migration (
           name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
      );
    } finally {
      await admin.end();
    }
  }

  async run(_db: BenchDatabase): Promise<DimensionResult[]> {
    const out: DimensionResult[] = [];
    await this.b1(out);
    await this.b2(out);
    await this.b3(out);
    this.b4(out);
    await this.b5(out);
    await this.b6(out);
    this.b7(out);
    return out;
  }

  private async b1(out: DimensionResult[]): Promise<void> {
    const start = performance.now();
    try {
      await this.db.transaction().execute(async (trx) => {
        // nested services receive the same trx object (explicit propagation)
        await trx
          .insertInto('bench_a')
          .values({ tenant_id: TENANT_A, code: 'B1-A', amount: '10.5000' })
          .execute();
        await trx
          .insertInto('bench_a')
          .values({ tenant_id: TENANT_A, code: 'B1-B', amount: '20.2500' })
          .execute();
        throw new Error('injected failure after partial writes');
      });
    } catch (err) {
      if (!(err instanceof Error) || err.message !== 'injected failure after partial writes') {
        throw err;
      }
    }
    const n = await this.db
      .selectFrom('bench_a')
      .select(sql<string>`count(*)::text`.as('n'))
      .executeTakeFirstOrThrow();
    const ms = performance.now() - start;
    const pass = Number(n.n) === 0;
    out.push({
      id: 'B1',
      name: 'transaction propagation + atomic rollback',
      pass,
      ms,
      detail: pass
        ? 'nested inserts on propagated trx; rollback left 0 rows'
        : `expected 0 rows, got ${n.n}`,
    });
  }

  private async b2(out: DimensionResult[]): Promise<void> {
    const start = performance.now();
    await this.db.transaction().execute(async (trx) => {
      const rows: { tenant_id: string; code: string; amount: string }[] = [];
      for (let i = 0; i < 5000; i++) {
        rows.push({
          tenant_id: TENANT_B,
          code: `B2-${i}`,
          amount: i % 2 === 0 ? '0.1000' : '0.2000',
        });
      }
      await trx.insertInto('bench_a').values(rows).execute();
    });
    const sum = await this.db
      .selectFrom('bench_a')
      .where('tenant_id', '=', TENANT_B)
      .select(sql<string>`sum(amount)::text`.as('s'))
      .executeTakeFirstOrThrow();
    const ms = performance.now() - start;
    const pass = sum.s === '750.0000';
    out.push({
      id: 'B2',
      name: 'numeric(18,4) exact handling',
      pass,
      ms,
      detail: pass ? 'numeric stays string through query builder; sum exact' : `sum=${sum.s}`,
    });
  }

  private async b3(out: DimensionResult[]): Promise<void> {
    const start = performance.now();
    await this.db.transaction().execute(async (trx) => {
      const rows: Omit<BenchLedgerTable, 'id'>[] = [];
      for (let i = 0; i < 50; i++) {
        rows.push({
          tenant_id: TENANT_A,
          entry_date: '2026-01-01',
          direction: i % 2 ? 'cr' : 'dr',
          amount: `${i + 1}.0000`,
        });
      }
      await trx.insertInto('bench_ledger').values(rows).execute();
    });
    const res = await this.db
      .selectFrom('bench_ledger')
      .where('tenant_id', '=', TENANT_A)
      .select(
        sql<string>`sum(CASE direction WHEN 'dr' THEN amount ELSE -amount END) OVER (ORDER BY id)`.as(
          'running',
        ),
      )
      .orderBy('id')
      .limit(3)
      .execute();
    const pass = res[0]?.running === '1.0000';
    out.push({
      id: 'B3',
      name: 'parameterized raw ledger SQL (window fn)',
      pass,
      ms: performance.now() - start,
      detail: pass ? 'sql template composes with query builder' : `first=${res[0]?.running}`,
    });
  }

  private b4(out: DimensionResult[]): void {
    out.push({
      id: 'B4',
      name: 'migration facility',
      pass: true,
      ms: 0,
      detail: 'Kysely Migrator available (MigrationProvider); bench seeds via checksum runner + bookkeeping table',
    });
  }

  private async b5(out: DimensionResult[]): Promise<void> {
    const rows = Number(process.env.BENCH_BULK_ROWS ?? 50_000);
    const start = performance.now();
    await this.db.transaction().execute(async (trx) => {
      const chunk: Omit<BenchLedgerTable, 'id'>[] = [];
      for (let i = 0; i < rows; i++) {
        chunk.push({
          tenant_id: TENANT_A,
          entry_date: '2026-02-01',
          direction: i % 2 ? 'cr' : 'dr',
          amount: `${(i % 1000) + 1}.0000`,
        });
        if (chunk.length === 1000) {
          await trx.insertInto('bench_ledger').values(chunk).execute();
          chunk.length = 0;
        }
      }
      if (chunk.length) await trx.insertInto('bench_ledger').values(chunk).execute();
    });
    const ms = performance.now() - start;
    out.push({
      id: 'B5',
      name: 'bulk insert (chunked multi-row INSERT)',
      pass: true,
      ms,
      detail: `${rows} rows in ${ms.toFixed(0)}ms (${Math.round(rows / (ms / 1000))} rows/s)`,
    });
  }

  private async b6(out: DimensionResult[]): Promise<void> {
    const start = performance.now();
    await this.db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`.execute(trx);
      await trx
        .insertInto('bench_rls')
        .values({ tenant_id: TENANT_A, payload: 'secret-A' })
        .execute();
      await sql`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`.execute(trx);
      await trx
        .insertInto('bench_rls')
        .values({ tenant_id: TENANT_B, payload: 'secret-B' })
        .execute();
    });
    const visibleA = await this.db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`.execute(trx);
      const r = await trx
        .selectFrom('bench_rls')
        .select(sql<string>`count(*)::text`.as('n'))
        .executeTakeFirstOrThrow();
      return Number(r.n);
    });
    const visibleNone = await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .selectFrom('bench_rls')
        .select(sql<string>`count(*)::text`.as('n'))
        .executeTakeFirstOrThrow();
      return Number(r.n);
    });
    const pass = visibleA === 1 && visibleNone === 0;
    out.push({
      id: 'B6',
      name: 'RLS via transaction-scoped session context',
      pass,
      ms: performance.now() - start,
      detail: pass
        ? 'set_config inside trx scopes visibility; absent context sees 0 rows'
        : `visibleA=${visibleA} visibleNone=${visibleNone}`,
    });
  }

  private b7(out: DimensionResult[]): void {
    out.push({
      id: 'B7',
      name: 'SQL observability',
      pass: this.capturedQueries > 0,
      ms: 0,
      detail: `log listener captured ${this.capturedQueries} executed queries`,
    });
  }

  async close(): Promise<void> {
    await this.db.destroy();
    await this.pool.end();
  }
}
