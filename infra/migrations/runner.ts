/**
 * Minimal, strict SQL migration runner for infra/migrations.
 * - Applies *.sql files in filename order, one transaction per file.
 * - Records name + sha256 checksum in schema_migration.
 * - Re-run: identical checksum -> skip; drift -> hard error (no silent edits).
 * - Ensures the least-privilege app role exists first (idempotent).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from 'pg';

export const APP_ROLE = 'idepot_app';

export interface RunMigrationsOptions {
  adminUrl: string;
  /** Password for the idepot_app role (created idempotently). */
  appRolePassword?: string;
  /** Directory containing ordered *.sql migrations. */
  migrationsDir?: string;
}

export interface AppliedMigration {
  name: string;
  checksum: string;
  action: 'applied' | 'skipped-identical';
}

function ensureRoleSql(role: string, password: string): string {
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE ${role} LOGIN PASSWORD '${password}';
  ELSE
    ALTER ROLE ${role} LOGIN PASSWORD '${password}';
  END IF;
END $$;`;
}

export async function runMigrations(opts: RunMigrationsOptions): Promise<AppliedMigration[]> {
  const dir = opts.migrationsDir ?? new URL('.', import.meta.url).pathname;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString: opts.adminUrl });
  await client.connect();
  const applied: AppliedMigration[] = [];
  try {
    await client.query(
      ensureRoleSql(APP_ROLE, opts.appRolePassword ?? 'idepot_app_dev'),
    );
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migration WHERE name = $1',
        [file],
      );
      if (existing.rowCount) {
        if (existing.rows[0]!.checksum !== checksum) {
          throw new Error(
            `migration ${file} has changed on disk (checksum drift). ` +
              'Applied migrations are immutable; add a new file instead.',
          );
        }
        applied.push({ name: file, checksum, action: 'skipped-identical' });
        continue;
      }
      const tx = await client.query('BEGIN');
      void tx;
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)',
          [file, checksum],
        );
        await client.query('COMMIT');
        applied.push({ name: file, checksum, action: 'applied' });
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `migration ${basename(file)} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}
