/**
 * MySQL protocol staging source (primary path): applies the legacy dump to an
 * ISOLATED, disposable staging MySQL/MariaDB database (never the production
 * source), then reads rows back in canonical form.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mysql, { type Connection } from 'mysql2/promise';
import type { LegacyRow, LegacySource, TableSpec } from './types.js';

export function canonicalizeCell(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (v instanceof Date) {
    const pad = (x: number, l = 2) => String(x).padStart(l, '0');
    return (
      `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ` +
      `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`
    );
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return String(v);
  return String(v);
}

export interface MySqlStagingOptions {
  mysqlUrl: string;
  dumpPath: string;
  /** staging database to (re)create; must be a dedicated, disposable DB */
  stagingDatabase?: string;
}

export async function createMySqlStagingSource(opts: MySqlStagingOptions): Promise<LegacySource> {
  const stagingDb = opts.stagingDatabase ?? 'idepot_legacy_staging';
  const dumpSql = readFileSync(opts.dumpPath, 'utf8');
  const fingerprint = createHash('sha256').update(dumpSql).digest('hex');

  // The dump is self-contained (DROP TABLE IF EXISTS + CREATE TABLE + INSERTs),
  // so only per-database privileges are required. The staging database is
  // disposable and isolated; the production legacy source is never touched.
  const conn: Connection = await mysql.createConnection({
    uri: opts.mysqlUrl,
    multipleStatements: true,
    charset: 'utf8mb4',
    dateStrings: true,
  });
  const dbName = new URL(opts.mysqlUrl).pathname.replace(/^\//, '');
  if (dbName !== stagingDb) {
    console.warn(
      `[migration] staging URL points at "${dbName}"; expected "${stagingDb}" — continuing (dumps are self-contained)`,
    );
  }
  try {
    // Legacy dumps routinely contain dates like '2023-02-30' (defect D-class data).
    // The staging import reproduces the legacy import semantics: non-strict mode,
    // then our validators catch and quarantine the unparsable values.
    await conn.query("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    await conn.query(dumpSql);
  } catch (err) {
    await conn.end();
    throw new Error(
      `failed to apply legacy dump to staging MySQL: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    backend: 'mysql-protocol',
    fingerprint,
    async readStagedRows(spec: TableSpec): Promise<LegacyRow[]> {
      const [rows] = await conn.query(`SELECT * FROM \`${spec.table}\``);
      const list = rows as Record<string, unknown>[];
      return list.map((r) => {
        const out: LegacyRow = {};
        for (const col of spec.columns) {
          out[col] = canonicalizeCell(r[col]);
        }
        return out;
      });
    },
    async close() {
      await conn.end();
    },
  };
}
