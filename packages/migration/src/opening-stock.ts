/**
 * Opening-stock import (migration strategy §4 — count-first policy, LOCKED):
 *
 *  - a physical count row for (item, store) is the preferred authority →
 *    opening = counted quantity; any variance vs the legacy stored quantity
 *    emits a correction-aware reconciliation record (I1 evidence);
 *  - NO count row → legacy stored quantity (items.quantity × package factor +
 *    items.unit_quantity) may be used ONLY as an explicitly flagged accepted
 *    migration risk: the count document is marked accepted_migration_risk,
 *    a reconciliation record requires owner/accountant sign-off, and the
 *    fallback is never silent;
 *  - legacy stock figures are never copied as verified truth.
 *
 * Movements are append-only ledger receipts (reason opening_balance) with the
 * count document as source; balances are derived. Idempotent via legacy_id_map
 * (('opening_stock_count', '<item>:<store>') → stock_count) — the correction
 * RECORDS derive from staged data alone and are therefore emitted on every
 * run (stable evidence set), while the target writes are skipped on reuse.
 */
import type { PoolClient, Client } from 'pg';
import type { LegacyRow, ReconciliationRecord } from './types.js';
import { ExactnessError, divScaledRounded, formatScaled, mulScaled, parseScaled } from './exact.js';
import { findMappedId, writeLegacyMap, type TransformReject } from './transform-phase2.js';

export interface OpeningStockOptions {
  tenantId: string;
  runId: string;
}

export interface OpeningStockResult {
  docsCreated: number;
  docsReused: number;
  movements: number;
  riskItems: number;
  variances: number;
  records: ReconciliationRecord[];
  rejects: TransformReject[];
}

export async function transformOpeningStock(
  client: PoolClient | Client,
  items: LegacyRow[],
  counts: LegacyRow[],
  productByItem: Map<string, string>,
  maxFactorByItem: Map<string, bigint>,
  opts: OpeningStockOptions,
): Promise<OpeningStockResult> {
  const result: OpeningStockResult = {
    docsCreated: 0,
    docsReused: 0,
    movements: 0,
    riskItems: 0,
    variances: 0,
    records: [],
    rejects: [],
  };

  // store -> warehouse mapping (written by the Phase 1 transformStores step)
  const warehouseByStore = new Map<string, string>();
  const whMap = await client.query<{ legacy_id: string; target_id: string }>(
    `SELECT legacy_id, target_id FROM legacy_id_map WHERE legacy_table = 'store' AND target_table = 'warehouse'`,
  );
  for (const r of whMap.rows) warehouseByStore.set(r.legacy_id, r.target_id);

  const countsByKey = new Map<string, LegacyRow>();
  for (const c of counts) {
    const key = `${c.item_id ?? ''}:${c.store_id ?? ''}`;
    countsByKey.set(key, c);
  }

  for (const item of items) {
    const legacyItemId = item.id ?? '';
    const productId = productByItem.get(legacyItemId);
    if (!productId) continue; // not imported (quarantined upstream)

    const storeId = item.store_id ?? '';
    const warehouseId = warehouseByStore.get(storeId);
    if (!warehouseId) continue; // store unmapped — item stays stockless (reported upstream)

    // a count row for an unimportable item is claimed here only when the item
    // imports; unclaimed rows are quarantined in the reject pass below
    const countRow = countsByKey.get(`${legacyItemId}:${storeId}`);
    if (countRow) countsByKey.delete(`${legacyItemId}:${storeId}`);

    // legacy stored base quantity: quantity × package factor + loose base units
    // (all values scaled at 10^6; product lands at scale 10^12 → re-scale to
    // 10^6, exact when possible, half-even with an evidence note otherwise)
    const maxFactor = maxFactorByItem.get(legacyItemId) ?? null;
    let legacyBase = 0n;
    let factorRounded = false;
    try {
      const qty = parseScaled(item.quantity, 6);
      if (maxFactor !== null) {
        const product = mulScaled(qty, maxFactor); // scale 12
        const divisor = 10n ** 6n;
        if (product % divisor === 0n) {
          legacyBase = product / divisor;
        } else {
          legacyBase = divScaledRounded(product, divisor);
          factorRounded = true;
        }
      } else {
        legacyBase = qty;
      }
      legacyBase += parseScaled(item.unit_quantity, 6);
    } catch (err) {
      if (err instanceof ExactnessError) {
        result.rejects.push({
          table: 'item',
          pk: legacyItemId,
          reasonCode: 'numeric_unparsable',
          reasonDetail: `opening stock reconstruction failed: ${String(err.message)}`,
          row: item,
        });
        continue;
      }
      throw err;
    }

    const mapId = `${legacyItemId}:${storeId}`;
    const hasCount = countRow != null && (countRow.counted_quantity ?? '') !== '';
    const authority = hasCount ? 'physical_count' : 'legacy_quantity';
    const acceptedRisk = !hasCount;
    const openingScaled = hasCount ? parseScaled(countRow!.counted_quantity, 6) : legacyBase;
    const opening = formatScaled(openingScaled, 6);

    // ---- correction-aware reconciliation records (stable across re-runs) ----
    if (acceptedRisk && legacyBase !== 0n) {
      result.riskItems++;
      result.records.push({
        legacy_table: 'item',
        legacy_id: legacyItemId,
        field: 'opening_quantity_base',
        legacy_stored_value: {
          quantity: item.quantity ?? null,
          unit_quantity: item.unit_quantity ?? null,
          package_factor: maxFactor !== null ? formatScaled(maxFactor, 6) : null,
          store_id: storeId,
        },
        legacy_reconstructed_value: {
          note: 'no independent legacy evidence for the drift-prone aggregate (I1); stored figure used as fallback only',
          base_quantity: formatScaled(legacyBase, 6),
          factor_rounded_at_6dp: factorRounded,
        },
        new_system_value: {
          opening_base_quantity: opening,
          authority: 'legacy_quantity',
          accepted_migration_risk: true,
        },
        correction_delta: { opening_quantity_base: '0' },
        correction_reason: 'I1_LEGACY_QUANTITY_WITHOUT_COUNT_ACCEPTED_RISK',
        evidence: {
          defect: 'I1',
          source: 'migration-reconciliation-strategy.md §4; stock-movement-map.md §1',
          store_id: storeId,
          note: 'legacy stock is replicated across ≥7 drifting stores; count declined for this item/location',
        },
        severity: 'critical',
        requires_manual_approval: true,
      });
    } else if (!acceptedRisk) {
      const variance = openingScaled - legacyBase;
      if (variance !== 0n) {
        result.variances++;
        result.records.push({
          legacy_table: 'item',
          legacy_id: legacyItemId,
          field: 'opening_quantity_base',
          legacy_stored_value: {
            quantity: item.quantity ?? null,
            unit_quantity: item.unit_quantity ?? null,
            package_factor: maxFactor !== null ? formatScaled(maxFactor, 6) : null,
            store_id: storeId,
            base_quantity: formatScaled(legacyBase, 6),
          },
          legacy_reconstructed_value: {
            base_quantity: formatScaled(legacyBase, 6),
            factor_rounded_at_6dp: factorRounded,
          },
          new_system_value: {
            opening_base_quantity: opening,
            authority: 'physical_count',
            counted_quantity: countRow!.counted_quantity ?? null,
          },
          correction_delta: { opening_quantity_base: formatScaled(variance, 6) },
          correction_reason: 'I1_OPENING_STOCK_COUNT_VARIANCE',
          evidence: {
            defect: 'I1',
            source: 'migration-reconciliation-strategy.md §4; stock-movement-map.md §1',
            store_id: storeId,
            note: 'physical count is the cutover authority; legacy aggregate is drift-prone (updateZeroBalanceItems patch evidence)',
          },
          severity: 'high',
          requires_manual_approval: true,
        });
      }
    }

    // ---- idempotent target write: reuse the mapped count doc on re-runs ----
    const reused = await findMappedId(
      client,
      'opening_stock_count',
      mapId,
      'stock_count',
      'stock_count',
      opts.tenantId,
    );
    if (reused) {
      result.docsReused++;
      continue;
    }

    const code = `OS-${storeId}-${legacyItemId}`;
    const evidence = hasCount
      ? `physical count sheet row ${countRow!.id} by ${countRow!.counted_by ?? 'unknown'} on ${countRow!.counted_date ?? 'unknown'}`
      : 'legacy items.quantity × package factor + items.unit_quantity (NO physical count — accepted migration risk)';

    const countRes = await client.query<{ id: string }>(
      `INSERT INTO stock_count
         (tenant_id, warehouse_id, code, status, authority, accepted_migration_risk,
          source_evidence, counted_by, counted_at, approved_at, note)
       VALUES ($1,$2,$3,'approved',$4,$5,$6,$7,
               COALESCE($8::timestamptz, now()), now(), $9)
       ON CONFLICT (tenant_id, code) DO UPDATE SET accepted_migration_risk = EXCLUDED.accepted_migration_risk
       RETURNING id`,
      [
        opts.tenantId,
        warehouseId,
        code,
        authority,
        acceptedRisk,
        evidence,
        hasCount ? countRow!.counted_by ?? 'migration' : 'migration (legacy fallback)',
        hasCount ? countRow!.counted_date ?? null : null,
        hasCount
          ? null
          : 'IMPORTED WITH ACCEPTED MIGRATION RISK — owner/accountant sign-off required before cutover',
      ],
    );
    const countId = countRes.rows[0]!.id;
    await writeLegacyMap(client, 'opening_stock_count', mapId, 'stock_count', countId, opts.runId);
    result.docsCreated++;

    await client.query(
      `INSERT INTO stock_count_line (tenant_id, count_id, product_id, counted_quantity_base, system_quantity_base)
       VALUES ($1,$2,$3,$4,'0')
       ON CONFLICT (count_id, product_id) DO UPDATE SET counted_quantity_base = EXCLUDED.counted_quantity_base`,
      [opts.tenantId, countId, productId, opening],
    );

    if (openingScaled !== 0n) {
      await client.query(
        `INSERT INTO stock_movement
           (tenant_id, warehouse_id, product_id, movement_type, quantity_base, reason,
            source_document_type, source_document_id, occurred_at)
         VALUES ($1,$2,$3,'receipt',$4,'opening_balance','stock_opening',$5,
                 COALESCE($6::timestamptz, now()))`,
        [
          opts.tenantId,
          warehouseId,
          productId,
          opening,
          countId,
          hasCount ? countRow!.counted_date ?? null : null,
        ],
      );
      result.movements++;
      await client.query(
        `INSERT INTO stock_balance (tenant_id, warehouse_id, product_id, quantity_base)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id, warehouse_id, product_id)
         DO UPDATE SET quantity_base = EXCLUDED.quantity_base, updated_at = now()`,
        [opts.tenantId, warehouseId, productId, opening],
      );
    }
  }

  // unclaimed count rows reference items/stores that were not imported
  for (const [key, row] of countsByKey) {
    result.rejects.push({
      table: 'opening_stock_count',
      pk: row.id ?? key,
      reasonCode: 'fk_orphan',
      reasonDetail: `opening_stock_count ${row.id ?? key} references item ${row.item_id ?? '?'}/store ${row.store_id ?? '?'} which was not imported`,
      row,
    });
  }

  return result;
}
