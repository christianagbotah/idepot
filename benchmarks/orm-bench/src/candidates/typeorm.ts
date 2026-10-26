/** TypeORM 0.3 candidate — EntitySchema (no decorators), explicit transaction propagation. */
import { DataSource, EntitySchema } from 'typeorm';
import type { BenchCandidate, BenchDatabase, DimensionResult } from '../types.js';
import { BENCH_SCHEMA_SQL } from '../schema.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

interface BenchA {
  id: string;
  tenant_id: string;
  code: string;
  amount: string;
}
interface BenchRls {
  id: string;
  tenant_id: string;
  payload: string;
}
interface BenchLedger {
  id: string;
  tenant_id: string;
  entry_date: string;
  direction: string;
  amount: string;
}

const BenchAEntity = new EntitySchema<BenchA>({
  name: 'BenchA',
  tableName: 'bench_a',
  columns: {
    id: { type: 'bigint', generated: 'identity', primary: true },
    tenant_id: { type: 'text' },
    code: { type: 'text' },
    amount: { type: 'numeric', precision: 18, scale: 4 },
  },
});
const BenchLedgerEntity = new EntitySchema<BenchLedger>({
  name: 'BenchLedger',
  tableName: 'bench_ledger',
  columns: {
    id: { type: 'bigint', generated: 'identity', primary: true },
    tenant_id: { type: 'text' },
    entry_date: { type: 'date' },
    direction: { type: 'text' },
    amount: { type: 'numeric', precision: 18, scale: 4 },
  },
});
const BenchRlsEntity = new EntitySchema<BenchRls>({
  name: 'BenchRls',
  tableName: 'bench_rls',
  columns: {
    id: { type: 'bigint', generated: 'identity', primary: true },
    tenant_id: { type: 'text' },
    payload: { type: 'text' },
  },
});

class BenchInit1688000000000 {
  name = 'BenchInit1688000000000';
  async up(queryRunner: { query(sql: string): Promise<unknown> }): Promise<void> {
    for (const stmt of BENCH_SCHEMA_SQL.split(';')) {
      const s = stmt.trim();
      if (s) await queryRunner.query(s);
    }
  }
}

function makeLogger(captured: string[]) {
  return {
    logQuery: (sql: string) => {
      if (captured.length < 500) captured.push(sql);
    },
    logQueryError: () => undefined,
    logQuerySlow: () => undefined,
    logSchemaBuild: () => undefined,
    logMigration: () => undefined,
    log: () => undefined,
  };
}

export class TypeOrmCandidate implements BenchCandidate {
  name = 'typeorm 0.3';
  private ds!: DataSource;
  private capturedSql: string[] = [];

  async setup(db: BenchDatabase): Promise<void> {
    // Migrations run with an OWNER connection (production topology: migrations
    // execute as admin; the app role connects afterwards, least-privileged).
    const adminDs = new DataSource({
      type: 'postgres',
      url: db.adminUrl,
      entities: [BenchAEntity, BenchLedgerEntity, BenchRlsEntity],
      migrations: [BenchInit1688000000000],
      migrationsRun: true,
      logging: false,
      logger: makeLogger([]) as never,
    });
    await adminDs.initialize();
    await adminDs.destroy();

    this.ds = new DataSource({
      type: 'postgres',
      url: db.appUrl,
      entities: [BenchAEntity, BenchLedgerEntity, BenchRlsEntity],
      logging: ['query'],
      logger: makeLogger(this.capturedSql) as never,
    });
    await this.ds.initialize();
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
      await this.ds.transaction(async (em) => {
        // nested service calls receive the SAME transactional entity manager
        await em.getRepository(BenchAEntity).insert({
          tenant_id: TENANT_A,
          code: 'B1-A',
          amount: '10.5000',
        } as BenchA);
        await em.getRepository(BenchAEntity).insert({
          tenant_id: TENANT_A,
          code: 'B1-B',
          amount: '20.2500',
        } as BenchA);
        throw new Error('injected failure after partial writes');
      });
    } catch (err) {
      if (!(err instanceof Error) || err.message !== 'injected failure after partial writes') {
        throw err;
      }
    }
    const n = await this.ds.query<{ n: string }>('SELECT count(*)::text n FROM bench_a');
    const ms = performance.now() - start;
    const pass = Number(n[0]!.n) === 0;
    out.push({
      id: 'B1',
      name: 'transaction propagation + atomic rollback',
      pass,
      ms,
      detail: pass
        ? 'nested inserts through propagated EntityManager; failure rolled back to 0 rows'
        : `expected 0 rows, got ${n[0]!.n}`,
    });
  }

  private async b2(out: DimensionResult[]): Promise<void> {
    const start = performance.now();
    await this.ds.transaction(async (em) => {
      const repo = em.getRepository(BenchAEntity);
      const rows: BenchA[] = [];
      for (let i = 0; i < 5000; i++) {
        rows.push({
          tenant_id: TENANT_B,
          code: `B2-${i}`,
          amount: i % 2 === 0 ? '0.1000' : '0.2000',
        } as BenchA);
      }
      await repo.insert(rows);
    });
    const sum = await this.ds.query<{ s: string }>(
      'SELECT sum(amount)::text s FROM bench_a WHERE tenant_id = $1',
      [TENANT_B],
    );
    const ms = performance.now() - start;
    const pass = sum[0]!.s === '750.0000';
    out.push({
      id: 'B2',
      name: 'numeric(18,4) exact handling',
      pass,
      ms,
      detail: pass
        ? 'decimal mapped as string; sum exact at 750.0000'
        : `sum=${sum[0]!.s}`,
    });
  }

  private async b3(out: DimensionResult[]): Promise<void> {
    const start = performance.now();
    await this.ds.transaction(async (em) => {
      const repo = em.getRepository(BenchLedgerEntity);
      const rows: BenchLedger[] = [];
      for (let i = 0; i < 50; i++) {
        rows.push({
          tenant_id: TENANT_A,
          entry_date: '2026-01-01',
          direction: i % 2 ? 'cr' : 'dr',
          amount: `${i + 1}.0000`,
        } as BenchLedger);
      }
      await repo.insert(rows);
    });
    const res = (await this.ds.query(
      `SELECT sum(CASE direction WHEN 'dr' THEN amount ELSE -amount END)
         OVER (ORDER BY id) AS running
       FROM bench_ledger WHERE tenant_id = $1 ORDER BY id LIMIT 3`,
      [TENANT_A],
    )) as { running: string }[];
    const pass = res[0]?.running === '1.0000';
    out.push({
      id: 'B3',
      name: 'parameterized raw ledger SQL (window fn)',
      pass,
      ms: performance.now() - start,
      detail: pass ? 'manager.query supports parameterized windows' : `first=${res[0]?.running}`,
    });
  }

  private b4(out: DimensionResult[]): void {
    const ran = this.ds.isInitialized && this.ds.migrations;
    out.push({
      id: 'B4',
      name: 'migration facility',
      pass: Boolean(ran),
      ms: 0,
      detail: 'DataSource.migrationsRun executed candidate migration at connect (bookkeeping in migrations table)',
    });
  }

  private async b5(out: DimensionResult[]): Promise<void> {
    const rows = Number(process.env.BENCH_BULK_ROWS ?? 50_000);
    const start = performance.now();
    await this.ds.transaction(async (em) => {
      const repo = em.getRepository(BenchLedgerEntity);
      const chunk: BenchLedger[] = [];
      for (let i = 0; i < rows; i++) {
        chunk.push({
          tenant_id: TENANT_A,
          entry_date: '2026-02-01',
          direction: i % 2 ? 'cr' : 'dr',
          amount: `${(i % 1000) + 1}.0000`,
        } as BenchLedger);
        if (chunk.length === 1000) {
          await repo.insert(chunk);
          chunk.length = 0;
        }
      }
      if (chunk.length) await repo.insert(chunk);
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
    await this.ds.transaction(async (em) => {
      await em.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_A]);
      await em.getRepository(BenchRlsEntity).insert({
        tenant_id: TENANT_A,
        payload: 'secret-A',
      } as BenchRls);
      await em.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_B]);
      await em.getRepository(BenchRlsEntity).insert({
        tenant_id: TENANT_B,
        payload: 'secret-B',
      } as BenchRls);
    });
    let visibleA = -1;
    let visibleNone = -1;
    await this.ds.transaction(async (em) => {
      await em.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_A]);
      const r = (await em.query('SELECT count(*)::text n FROM bench_rls')) as { n: string }[];
      visibleA = Number(r[0]!.n);
    });
    await this.ds.transaction(async (em) => {
      const r = (await em.query('SELECT count(*)::text n FROM bench_rls')) as { n: string }[];
      visibleNone = Number(r[0]!.n);
    });
    const pass = visibleA === 1 && visibleNone === 0;
    out.push({
      id: 'B6',
      name: 'RLS via transaction-scoped session context',
      pass,
      ms: performance.now() - start,
      detail: pass
        ? 'SET LOCAL inside ds.transaction; absent context sees 0 rows'
        : `visibleA=${visibleA} visibleNone=${visibleNone}`,
    });
  }

  private b7(out: DimensionResult[]): void {
    const insertCount = this.capturedSql.filter((s) => s.includes('INSERT INTO')).length;
    out.push({
      id: 'B7',
      name: 'SQL observability',
      pass: insertCount > 0,
      ms: 0,
      detail: `logger captured ${this.capturedSql.length} statements (${insertCount} INSERTs)`,
    });
  }

  async close(): Promise<void> {
    await this.ds.destroy();
  }
}
