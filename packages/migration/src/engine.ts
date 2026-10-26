/**
 * Migration engine orchestration:
 *   dump -> isolated MySQL staging -> legacy_raw (COPY) -> checksums ->
 *   validators -> quarantine -> transform (legacy_id_map) -> correction-aware
 *   reconciliation -> migration_run registry -> reconciliation.json artifact.
 */
import { Client } from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  LegacySource,
  LegacyRow,
  ReconciliationArtifact,
  ReconciliationRecord,
  TableSpec,
} from './types.js';
import { FIXTURE_TABLES } from './types.js';
import { checksumRows } from './checksum.js';
import { assertLegacyRawReady, stageTable } from './stager.js';
import { runValidators, isQuarantined } from './validators.js';
import { reconcile } from './reconcile.js';
import { transformStores } from './transform.js';

export interface MigrationRunConfig {
  pgAdminUrl: string;
  source: LegacySource;
  tenantId: string;
  artifactsDir?: string;
  specs?: TableSpec[];
}

export interface MigrationRunResult {
  runId: string;
  artifact: ReconciliationArtifact;
  artifactPath?: string;
}

export async function runMigration(config: MigrationRunConfig): Promise<MigrationRunResult> {
  const specs = config.specs ?? FIXTURE_TABLES;
  const startedAt = new Date();

  const pg = new Client({ connectionString: config.pgAdminUrl });
  await pg.connect();
  try {
    // 1. run registry (start)
    const runRes = await pg.query<{ id: string }>(
      `INSERT INTO migration_run (status, source_fingerprint, staging_backend, command, notes)
       VALUES ('running', $1, $2, $3, $4) RETURNING id`,
      [config.source.fingerprint, config.source.backend, 'runMigration()', null],
    );
    const runId = runRes.rows[0]!.id;

    try {
      // 2. staging: read canonical rows from the source backend
      const staged = new Map<string, LegacyRow[]>();
      for (const spec of specs) {
        staged.set(spec.table, await config.source.readStagedRows(spec));
      }

      // 3. legacy_raw load (the stager asserts DDL ownership; never creates)
      await assertLegacyRawReady(pg, specs);
      const loaded: Array<{ table: string; loadedRows: number }> = [];
      for (const spec of specs) {
        loaded.push(await stageTable(pg, spec, staged.get(spec.table) ?? []));
      }

      // 4. checksums: staging vs legacy_raw
      const tables = specs.map((spec, idx) => {
        const stagingCk = checksumRows(spec.columns, staged.get(spec.table) ?? []);
        const rawRes = pg.query; // marker to keep typing simple below
        void rawRes;
        return { spec, stagingCk, loadedRows: loaded[idx]!.loadedRows, idx };
      });
      const tableStats = [] as ReconciliationArtifact['tables'];
      for (const t of tables) {
        const raw = await pg.query<Record<string, unknown>>(
          `SELECT ${t.spec.columns.map((c) => `"${c}"`).join(', ')}, _src_row_number
           FROM legacy_raw."${t.spec.table}" ORDER BY _src_row_number`,
        );
        const rawRows: LegacyRow[] = raw.rows.map((r) => {
          const out: LegacyRow = {};
          for (const c of t.spec.columns) out[c] = (r[c] as string | null) ?? null;
          return out;
        });
        const rawCk = checksumRows(t.spec.columns, rawRows);
        tableStats.push({
          table: t.spec.table,
          stagedRows: t.stagingCk.rows,
          loadedRows: t.loadedRows,
          checksumStaging: t.stagingCk.checksum,
          checksumLegacyRaw: rawCk.checksum,
          checksumMatch: t.stagingCk.checksum === rawCk.checksum,
        });
      }

      // 5. validators
      const outcome = runValidators({ staged, specs });
      const quarantinedRows = outcome.findings.filter((f) => f.quarantine);
      for (const f of quarantinedRows) {
        const row = (staged.get(f.table) ?? []).find((r) => r[(specs.find((s) => s.table === f.table)?.pk ?? 'id')] === f.pk);
        const srcNum = row ? (staged.get(f.table) ?? []).indexOf(row) + 1 : null;
        await pg.query(
          `INSERT INTO quarantine_row (run_id, legacy_table, legacy_pk, src_row_number, reason_code, reason_detail, severity, row_payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (run_id, legacy_table, legacy_pk, reason_code) DO NOTHING`,
          [
            runId,
            f.table,
            f.pk,
            srcNum,
            f.reasonCode,
            f.reasonDetail,
            f.severity,
            JSON.stringify(row ?? {}),
          ],
        );
      }

      // 6. transform: store -> warehouse (clean rows only, idempotent)
      const storeSpec = specs.find((s) => s.table === 'store')!;
      const storeRows = (staged.get('store') ?? []).filter(
        (r) => !isQuarantined(outcome.findings, 'store', r[storeSpec.pk] ?? ''),
      );
      const transformStats = await transformStores(pg, storeRows, {
        tenantId: config.tenantId,
        runId,
      });

      // 7. correction-aware reconciliation (D1 + payment-sum mismatches)
      const invoiceSpec = specs.find((s) => s.table === 'invoice')!;
      const invoiceRows = (staged.get('invoice') ?? []).filter(
        (r) => !isQuarantined(outcome.findings, 'invoice', r[invoiceSpec.pk] ?? ''),
      );
      const paymentSpec = specs.find((s) => s.table === 'payment')!;
      const paymentRows = (staged.get('payment') ?? []).filter(
        (r) => !isQuarantined(outcome.findings, 'payment', r[paymentSpec.pk] ?? ''),
      );
      const recon = reconcile(invoiceRows, paymentRows);
      for (const rec of recon.records) {
        await pg.query(
          `INSERT INTO reconciliation_record
             (run_id, legacy_table, legacy_id, field, legacy_stored_value, legacy_reconstructed_value,
              new_system_value, correction_delta, correction_reason, evidence, severity, requires_manual_approval)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (run_id, legacy_table, legacy_id, field) DO NOTHING`,
          [
            runId,
            rec.legacy_table,
            rec.legacy_id,
            rec.field,
            JSON.stringify(rec.legacy_stored_value),
            JSON.stringify(rec.legacy_reconstructed_value),
            JSON.stringify(rec.new_system_value),
            JSON.stringify(rec.correction_delta),
            rec.correction_reason,
            JSON.stringify(rec.evidence),
            rec.severity,
            rec.requires_manual_approval,
          ],
        );
      }

      // 8. finalize run registry
      const finishedAt = new Date();
      const artifact: ReconciliationArtifact = {
        runId,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        sourceFingerprint: config.source.fingerprint,
        stagingBackend: config.source.backend,
        tables: tableStats,
        validators: outcome.checks,
        quarantine: {
          total: quarantinedRows.length,
          byReason: quarantinedRows.reduce<Record<string, number>>((acc, f) => {
            acc[f.reasonCode] = (acc[f.reasonCode] ?? 0) + 1;
            return acc;
          }, {}),
        },
        reconciliation: {
          summary: {
            records: recon.records.length,
            flagged: new Set(recon.records.map((r) => r.legacy_id)).size,
            requiresManualApproval: recon.records.filter((r) => r.requires_manual_approval).length,
          },
          records: recon.records,
        },
        warnings: [...outcome.censusWarnings, ...recon.warnings.map((w) => ({ code: 'reconcile', table: '-', message: w }))],
        transform: transformStats,
      };

      await pg.query(
        `UPDATE migration_run SET status='completed', finished_at=$2, stats=$3 WHERE id=$1`,
        [runId, finishedAt, JSON.stringify({ artifactSummary: artifact.quarantine, recon: artifact.reconciliation.summary })],
      );

      // 9. artifacts
      let artifactPath: string | undefined;
      if (config.artifactsDir) {
        const dir = resolve(config.artifactsDir);
        mkdirSync(dir, { recursive: true });
        artifactPath = join(dir, 'reconciliation.json');
        writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
        writeFileSync(join(dir, 'report.md'), humanReport(artifact));
      }

      return { runId, artifact, artifactPath };
    } catch (err) {
      await pg
        .query(`UPDATE migration_run SET status='failed', finished_at=now(), notes=$2 WHERE id=$1`, [
          runId,
          err instanceof Error ? err.message : String(err),
        ])
        .catch(() => undefined);
      throw err;
    }
  } finally {
    await pg.end();
    await config.source.close();
  }
}

function humanReport(a: ReconciliationArtifact): string {
  const lines: string[] = [];
  lines.push(`# Migration reconciliation report`);
  lines.push('');
  lines.push(`- run: \`${a.runId}\``);
  lines.push(`- staging backend: ${a.stagingBackend}`);
  lines.push(`- source fingerprint: \`${a.sourceFingerprint.slice(0, 16)}…\``);
  lines.push('');
  lines.push('## Tables');
  lines.push('');
  lines.push('| table | staged | loaded | checksum match |');
  lines.push('|---|---|---|---|');
  for (const t of a.tables) {
    lines.push(`| ${t.table} | ${t.stagedRows} | ${t.loadedRows} | ${t.checksumMatch ? 'yes' : 'NO'} |`);
  }
  lines.push('');
  lines.push('## Quarantine');
  lines.push('');
  lines.push(`Total withheld rows: **${a.quarantine.total}**`);
  for (const [reason, n] of Object.entries(a.quarantine.byReason)) {
    lines.push(`- ${reason}: ${n}`);
  }
  lines.push('');
  lines.push('## Correction-aware reconciliation');
  lines.push('');
  lines.push(
    `Records: ${a.reconciliation.summary.records} (flagged documents: ${a.reconciliation.summary.flagged}, requiring manual approval: ${a.reconciliation.summary.requiresManualApproval})`,
  );
  for (const r of a.reconciliation.records) {
    lines.push('');
    lines.push(`### ${r.legacy_table}/${r.legacy_id} — ${r.correction_reason}`);
    lines.push(`- severity: ${r.severity}; manual approval required: ${r.requires_manual_approval}`);
    lines.push(`- stored: \`${JSON.stringify(r.legacy_stored_value)}\``);
    lines.push(`- reconstructed: \`${JSON.stringify(r.legacy_reconstructed_value)}\``);
    lines.push(`- new system: \`${JSON.stringify(r.new_system_value)}\``);
    lines.push(`- delta: \`${JSON.stringify(r.correction_delta)}\``);
  }
  return lines.join('\n');
}

export type { ReconciliationRecord };
