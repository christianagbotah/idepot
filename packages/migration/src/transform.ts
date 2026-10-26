/**
 * Transform: legacy `store` -> target `warehouse` (Phase 1 sample domain
 * mapping). Idempotent via legacy_id_map: (legacy_table, legacy_id) maps to
 * the SAME target forever; re-runs reuse mapped targets and never duplicate.
 */
import { PoolClient, type Client } from 'pg';
import type { LegacyCell, LegacyRow } from './types.js';

export interface TransformOptions {
  tenantId: string;
  runId: string;
}

export interface TransformResult {
  storesImported: number;
  storesReused: number;
  legacyIdMapRows: number;
}

function mapStatus(status: LegacyCell | undefined): { active: boolean; note?: string } {
  switch ((status ?? '').toUpperCase()) {
    case 'OPEN':
      return { active: true };
    case 'CLOSED':
      return { active: false };
    default:
      return { active: true, note: `unmapped store status "${status}" defaulted to active` };
  }
}

function warehouseCode(id: LegacyCell | undefined, name: LegacyCell | undefined): string {
  const base = (name ?? `WH-${id ?? 'UNKNOWN'}`)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  const code = `WH-${base || (id ?? 'UNKNOWN')}`;
  return code.length <= 32 ? code : code.slice(0, 32);
}

export async function transformStores(
  client: PoolClient | Client,
  cleanRows: LegacyRow[],
  opts: TransformOptions,
): Promise<TransformResult> {
  let imported = 0;
  let reused = 0;

  for (const row of cleanRows) {
    const legacyId = row.id ?? '';
    if (!legacyId) continue;

    const existingMap = await client.query<{ target_id: string }>(
      `SELECT target_id FROM legacy_id_map
       WHERE legacy_table = 'store' AND legacy_id = $1 AND target_table = 'warehouse'`,
      [legacyId],
    );
    if (existingMap.rowCount) {
      const targetId = existingMap.rows[0]!.target_id;
      const wh = await client.query('SELECT 1 FROM warehouse WHERE id = $1 AND tenant_id = $2', [
        targetId,
        opts.tenantId,
      ]);
      if (wh.rowCount) {
        reused++;
        continue;
      }
    }

    const status = mapStatus(row.status);
    const code = warehouseCode(row.id, row.name);
    // tenant-scoped unique: reuse an existing code within this tenant instead of failing
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO warehouse (tenant_id, code, name, is_active)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [opts.tenantId, code, row.name ?? `Legacy store ${legacyId}`, status.active],
    );
    const targetId = inserted.rows[0]!.id;
    await client.query(
      `INSERT INTO legacy_id_map (legacy_table, legacy_id, target_table, target_id, run_id)
       VALUES ('store', $1, 'warehouse', $2, $3)
       ON CONFLICT (legacy_table, legacy_id, target_table)
       DO UPDATE SET target_id = EXCLUDED.target_id, run_id = EXCLUDED.run_id`,
      [legacyId, targetId, opts.runId],
    );
    imported++;
  }

  const mapRows = await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM legacy_id_map WHERE legacy_table = 'store' AND target_table = 'warehouse'`,
  );
  return {
    storesImported: imported,
    storesReused: reused,
    legacyIdMapRows: Number(mapRows.rows[0]!.n),
  };
}
