/**
 * Stager: loads canonical legacy rows into the migration-layer-owned
 * `legacy_raw` schema via COPY FROM STDIN.
 *
 * OWNERSHIP CONTRACT (LOCKED, Phase 1): the schema and its tables are created
 * by the migration DDL (infra/migrations/0002_migration_workstream.sql). The
 * stager ASSUMES they exist — it never issues CREATE SCHEMA / CREATE TABLE and
 * fails fast with a precise error when the DDL layer has not run.
 */
import type { PoolClient} from 'pg';
import { type Client } from 'pg';
import * as pgCopyStreams from 'pg-copy-streams';
import type { LegacyCell, LegacyRow, TableSpec } from './types.js';

export type SqlClient = PoolClient | Client;

export class LegacyRawMissingError extends Error {
  constructor(detail: string) {
    super(
      `legacy_raw staging schema is not available (${detail}). ` +
        'It is owned by the migration DDL layer — apply infra/migrations (0002) first. ' +
        'The runtime stager NEVER creates schemas or tables.',
    );
    this.name = 'LegacyRawMissingError';
  }
}

export interface StageResult {
  table: string;
  loadedRows: number;
}

export async function assertLegacyRawReady(client: SqlClient, specs: TableSpec[]): Promise<void> {
  const schema = await client.query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'legacy_raw'`,
  );
  if (schema.rowCount === 0) {
    throw new LegacyRawMissingError('schema legacy_raw does not exist');
  }
  for (const spec of specs) {
    const t = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy_raw' AND table_name = $1`,
      [spec.table],
    );
    if (t.rowCount === 0) {
      throw new LegacyRawMissingError(`table legacy_raw.${spec.table} does not exist`);
    }
  }
}

/** COPY rows into legacy_raw.<table> after clearing prior run's staging rows. */
export async function stageTable(
  client: SqlClient,
  spec: TableSpec,
  rows: LegacyRow[],
): Promise<StageResult> {
  await client.query(`DELETE FROM legacy_raw."${spec.table}"`);
  if (rows.length === 0) return { table: spec.table, loadedRows: 0 };

  const cols = [...spec.columns, '_src_row_number'];
  // pg-copy-streams v7 ships no official types; declared in pg-copy-streams.d.ts.
  // Keep the method call ON the client (bound `this`) — only the argument type is widened.
  const stream = (
    client.query as unknown as (
      submittable: unknown,
    ) => NodeJS.WritableStream & {
      end(cb?: () => void): void;
      on(ev: string, cb: () => void): void;
    }
  )(
    pgCopyStreams.from(
      `COPY legacy_raw."${spec.table}" (${cols.map((c) => `"${c}"`).join(', ')}) FROM STDIN WITH (FORMAT text)`,
    ),
  );
  for (let i = 0; i < rows.length; i++) {
    const cells = spec.columns.map((c) => textCell(rows[i]![c]));
    cells.push(String(i + 1));
    stream.write(cells.join('\t') + '\n');
  }
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
    stream.end();
  });
  return { table: spec.table, loadedRows: rows.length };
}

function textCell(v: LegacyCell | undefined): string {
  // undefined (column absent from the staged row) must stage as SQL NULL —
  // the checksum treats a missing cell as null, so staging has to agree or
  // extended-column specs would never verify (staging '' ≠ legacy_raw NULL)
  if (v === null || v === undefined) return '\\N';
  return String(v).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}
