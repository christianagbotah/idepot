#!/usr/bin/env node
/**
 * ADR-0002 evidence runner.
 * Boots the embedded PostgreSQL, gives each candidate a dedicated database,
 * executes dimensions B1-B7, writes results/<ts>-orm-bench.json + latest.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { getTestPostgres } from '@idepot/testing';
import type { BenchCandidate, BenchResults } from './types.js';
import { RawPgCandidate } from './candidates/raw-pg.js';
import { TypeOrmCandidate } from './candidates/typeorm.js';
import { KyselyCandidate } from './candidates/kysely.js';

async function main(): Promise<number> {
  const pg = await getTestPostgres();
  const candidates: BenchCandidate[] = [
    new RawPgCandidate(),
    new TypeOrmCandidate(),
    new KyselyCandidate(),
  ];
  const reports: BenchResults['candidates'] = [];

  for (const candidate of candidates) {
    const dbName = `bench_${candidate.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
    process.stdout.write(`=== ${candidate.name} (db: ${dbName}) ===\n`);
    await pg.createDatabase(dbName);
    const db = {
      name: dbName,
      adminUrl: pg.adminUrlFor(dbName),
      appUrl: pg.appUrl(dbName),
    };
    try {
      await candidate.setup(db);
      const dimensions = await candidate.run(db);
      for (const d of dimensions) {
        process.stdout.write(
          `  ${d.id} ${d.pass ? 'PASS' : 'FAIL'} (${d.ms.toFixed(0)}ms) — ${d.name}: ${d.detail}\n`,
        );
      }
      reports.push({
        candidate: candidate.name,
        connection: 'app-role (least privilege)',
        dimensions,
        allPass: dimensions.every((d) => d.pass),
      });
    } catch (err) {
      process.stdout.write(
        `  ERRORS: ${err instanceof Error ? err.message : String(err)}\n  ${err instanceof Error && err.stack ? err.stack.split('\n').slice(1, 4).join('\n  ') : ''}\n`,
      );
      reports.push({
        candidate: candidate.name,
        connection: 'app-role (least privilege)',
        dimensions: [],
        allPass: false,
      });
    } finally {
      try {
        await candidate.close();
      } catch {
        /* a failed candidate may have no live connection */
      }
    }
  }

  const results: BenchResults = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    postgres: '18.4 (embedded)',
    bulkRows: Number(process.env.BENCH_BULK_ROWS ?? 50_000),
    criteria:
      'B1 explicit transaction propagation across nested services with atomic rollback; ' +
      'B2 numeric(18,4) exact round-trip/sum; B3 parameterized raw ledger SQL with window functions; ' +
      'B4 migration facility; B5 bulk insert throughput (10^5 scale, migration path); ' +
      'B6 RLS via transaction-scoped session context; B7 SQL observability.',
    candidates: reports,
  };

  const dir = join(process.cwd(), 'results');
  mkdirSync(dir, { recursive: true });
  const ts = results.generatedAt.replace(/[:.]/g, '-');
  writeFileSync(join(dir, `${ts}-orm-bench.json`), JSON.stringify(results, null, 2));
  writeFileSync(join(dir, 'latest.json'), JSON.stringify(results, null, 2));
  process.stdout.write(`Results written to results/${ts}-orm-bench.json\n`);

  const ok = reports.every((r) => r.allPass);
  process.stdout.write(ok ? 'BENCHMARK PASS\n' : 'BENCHMARK FAILED\n');
  return ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
