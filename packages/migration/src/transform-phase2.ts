/**
 * Phase 2 transform: legacy master data -> target catalog/parties.
 * Mapping per docs/migration/legacy-to-postgres-map.md §1:
 *   item_main_category + item_category -> product_category (two-level)
 *   units                              -> unit
 *   items                              -> product (+ product_barcode)
 *   units + units_items                -> unit + product_unit (unit_total →
 *                                         conversion factor to the base unit;
 *                                         base = the smallest-unit_total row)
 *   customers / suppliers              -> customer / supplier (phone-first)
 *
 * Every target is keyed through legacy_id_map — re-runs reuse mappings and
 * never duplicate. Rows that cannot map (unimportable upstream references,
 * duplicate barcodes/codes) are returned as rejects and land in quarantine.
 */
import type { PoolClient, Client } from 'pg';
import { randomUUID } from 'node:crypto';
import type { LegacyRow } from './types.js';
import { ExactnessError, divScaledExact, divScaledRounded, formatScaled, parseScaled } from './exact.js';

export interface Phase2TransformOptions {
  tenantId: string;
  runId: string;
}

export interface TransformReject {
  table: string;
  pk: string;
  reasonCode: string;
  reasonDetail: string;
  row: LegacyRow;
}

export interface Counter {
  imported: number;
  reused: number;
}

export const emptyCounter = (): Counter => ({ imported: 0, reused: 0 });

/** Reuse the mapped target id when it still exists in the tenant. */
export async function findMappedId(
  client: PoolClient | Client,
  legacyTable: string,
  legacyId: string,
  targetTable: string,
  targetCheckSql: string,
  tenantId: string,
): Promise<string | null> {
  const m = await client.query<{ target_id: string }>(
    `SELECT target_id FROM legacy_id_map
     WHERE legacy_table = $1 AND legacy_id = $2 AND target_table = $3`,
    [legacyTable, legacyId, targetTable],
  );
  if (!m.rowCount) return null;
  const ex = await client.query(
    `SELECT 1 FROM ${targetCheckSql} WHERE id = $1 AND tenant_id = $2`,
    [m.rows[0]!.target_id, tenantId],
  );
  return ex.rowCount ? m.rows[0]!.target_id : null;
}

export async function writeLegacyMap(
  client: PoolClient | Client,
  legacyTable: string,
  legacyId: string,
  targetTable: string,
  targetId: string,
  runId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO legacy_id_map (legacy_table, legacy_id, target_table, target_id, run_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (legacy_table, legacy_id, target_table)
     DO UPDATE SET target_id = EXCLUDED.target_id, run_id = EXCLUDED.run_id`,
    [legacyTable, legacyId, targetTable, targetId, runId],
  );
}

/** numeric(18,4) normalization for legacy double money; returns the string and
 *  whether half-even rounding actually changed the value (→ reconciliation). */
export function normalizeMoney(raw: string | null | undefined): { value: string; rounded: boolean } {
  const s = (raw ?? '').trim();
  if (s === '' || s === 'NULL') return { value: '0.0000', rounded: false };
  try {
    const exact = parseScaled(s, 4);
    return { value: formatScaled(exact, 4), rounded: false };
  } catch (err) {
    if (err instanceof ExactnessError) {
      const rounded = divScaledRounded(parseScaled(s, 12), 10n ** 8n);
      return { value: formatScaled(rounded, 4), rounded: true };
    }
    throw err;
  }
}

function unitCode(unitName: string | null | undefined): string {
  const code = (unitName ?? 'UNIT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'UNIT';
  return code;
}

function partyStatus(active: string | null | undefined): 'active' | 'inactive' {
  return (active ?? '').trim().toUpperCase() === 'ACTIVE' ? 'active' : 'inactive';
}

/* ------------------------------- categories ------------------------------- */

export async function transformCategories(
  client: PoolClient | Client,
  mains: LegacyRow[],
  subs: LegacyRow[],
  opts: Phase2TransformOptions,
): Promise<{ stats: Counter; rejects: TransformReject[] }> {
  const stats = emptyCounter();
  const rejects: TransformReject[] = [];
  const mainMap = new Map<string, string>();

  for (const row of mains) {
    const legacyId = row.category_id ?? '';
    if (!legacyId) continue;
    const reused = await findMappedId(client, 'item_main_category', legacyId, 'product_category', 'product_category', opts.tenantId);
    if (reused) {
      mainMap.set(legacyId, reused);
      stats.reused++;
      continue;
    }
    const name = row.category_name ?? `Main category ${legacyId}`;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO product_category (tenant_id, code, name, parent_id)
       VALUES ($1,$2,$3,NULL)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [opts.tenantId, `MCAT-${legacyId}`, name],
    );
    const id = inserted.rows[0]!.id;
    await writeLegacyMap(client, 'item_main_category', legacyId, 'product_category', id, opts.runId);
    mainMap.set(legacyId, id);
    stats.imported++;
  }

  for (const row of subs) {
    const legacyId = row.category_id ?? '';
    if (!legacyId) continue;
    const reused = await findMappedId(client, 'item_category', legacyId, 'product_category', 'product_category', opts.tenantId);
    if (reused) {
      stats.reused++;
      continue;
    }
    const mainId = row.main_id ?? '';
    const parent = mainMap.get(mainId) ?? null;
    if (!parent) {
      rejects.push({
        table: 'item_category',
        pk: legacyId,
        reasonCode: 'fk_orphan',
        reasonDetail: `item_category ${legacyId} references unknown main category ${mainId}`,
        row,
      });
      continue;
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO product_category (tenant_id, code, name, parent_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id
       RETURNING id`,
      [opts.tenantId, `CAT-${legacyId}`, row.category_name ?? `Category ${legacyId}`, parent],
    );
    await writeLegacyMap(client, 'item_category', legacyId, 'product_category', inserted.rows[0]!.id, opts.runId);
    stats.imported++;
  }

  return { stats, rejects };
}

/* --------------------------------- units ---------------------------------- */

export async function transformUnits(
  client: PoolClient | Client,
  rows: LegacyRow[],
  opts: Phase2TransformOptions,
): Promise<{ stats: Counter; rejects: TransformReject[]; unitMap: Map<string, string> }> {
  const stats = emptyCounter();
  const rejects: TransformReject[] = [];
  const unitMap = new Map<string, string>();

  // tenant-generic fallback unit for conversion-less products
  const ea = await client.query<{ id: string }>(
    `INSERT INTO unit (tenant_id, code, name) VALUES ($1,'EA','Each')
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [opts.tenantId],
  );
  unitMap.set('EA', ea.rows[0]!.id);

  for (const row of rows) {
    const legacyId = row.unit_id ?? '';
    if (!legacyId) continue;
    const reused = await findMappedId(client, 'units', legacyId, 'unit', 'unit', opts.tenantId);
    if (reused) {
      unitMap.set(legacyId, reused);
      stats.reused++;
      continue;
    }
    const name = row.unit_name ?? `Unit ${legacyId}`;
    let code = unitCode(name);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO unit (tenant_id, code, name)
       VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [opts.tenantId, code, name],
    );
    unitMap.set(legacyId, inserted.rows[0]!.id);
    await writeLegacyMap(client, 'units', legacyId, 'unit', inserted.rows[0]!.id, opts.runId);
    stats.imported++;
    void code;
  }

  return { stats, rejects, unitMap };
}

/* -------------------------------- parties --------------------------------- */

export async function transformParties(
  client: PoolClient | Client,
  customers: LegacyRow[],
  suppliers: LegacyRow[],
  opts: Phase2TransformOptions,
): Promise<{ customers: Counter; suppliers: Counter; rejects: TransformReject[] }> {
  const customersStats = emptyCounter();
  const suppliersStats = emptyCounter();
  const rejects: TransformReject[] = [];

  for (const row of customers) {
    const legacyId = row.customer_id ?? '';
    if (!legacyId) continue;
    const reused = await findMappedId(client, 'customers', legacyId, 'customer', 'customer', opts.tenantId);
    if (reused) {
      customersStats.reused++;
      continue;
    }
    const phone = (row.mobile ?? row.phone ?? '').trim() || '0000000000';
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO customer (tenant_id, code, name, contact_person, phone, alt_phone, email, address, is_guest, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [
        opts.tenantId,
        legacyId,
        row.customer_name ?? `Customer ${legacyId}`,
        row.contact_person ?? null,
        phone,
        row.phone ?? null,
        row.email ?? null,
        row.address ?? null,
        (row.guest ?? '') === '1',
        partyStatus(row.customer_active),
      ],
    );
    await writeLegacyMap(client, 'customers', legacyId, 'customer', inserted.rows[0]!.id, opts.runId);
    customersStats.imported++;
  }

  for (const row of suppliers) {
    const legacyId = row.supplier_id ?? '';
    if (!legacyId) continue;
    const reused = await findMappedId(client, 'suppliers', legacyId, 'supplier', 'supplier', opts.tenantId);
    if (reused) {
      suppliersStats.reused++;
      continue;
    }
    const phone = (row.mobile ?? row.phone ?? '').trim() || '0000000000';
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO supplier (tenant_id, code, name, contact_person, phone, alt_phone, email, address, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [
        opts.tenantId,
        legacyId,
        row.supplier_name ?? `Supplier ${legacyId}`,
        row.contact_person ?? null,
        phone,
        row.phone ?? null,
        row.email ?? null,
        row.address ?? null,
        partyStatus('ACTIVE'),
      ],
    );
    await writeLegacyMap(client, 'suppliers', legacyId, 'supplier', inserted.rows[0]!.id, opts.runId);
    suppliersStats.imported++;
  }

  return { customers: customersStats, suppliers: suppliersStats, rejects };
}

/* ---------------------- products + conversions ----------------------------- */

export interface ConversionInfo {
  /** legacy item_id -> imported product id */
  productByItem: Map<string, string>;
  /** legacy item_id -> largest surviving factor (scaled 10^6) for base reconstruction */
  maxFactorByItem: Map<string, bigint>;
  /** legacy item_id -> base product_unit info list */
  conversions: Map<string, Array<{ productUnitId: string; unitId: string; factorScaled: bigint }>>;
}

export async function transformProductsAndConversions(
  client: PoolClient | Client,
  items: LegacyRow[],
  conversions: LegacyRow[],
  unitMap: Map<string, string>,
  categoryMap: Map<string, string>,
  supplierMap: Map<string, string>,
  opts: Phase2TransformOptions,
): Promise<{ products: Counter; convStats: Counter; rejects: TransformReject[]; roundingWarnings: string[]; info: ConversionInfo }> {
  const products = emptyCounter();
  const convStats = emptyCounter();
  const rejects: TransformReject[] = [];
  const roundingWarnings: string[] = [];
  const productByItem = new Map<string, string>();
  const info: ConversionInfo = { productByItem, maxFactorByItem: new Map(), conversions: new Map() };

  // group conversion rows by item and derive base + factors (exact scaled math)
  const convByItem = new Map<string, LegacyRow[]>();
  for (const row of conversions) {
    const item = row.item_id ?? '';
    if (!item) continue;
    const list = convByItem.get(item) ?? [];
    list.push(row);
    convByItem.set(item, list);
  }

  // barcode uniqueness within the run (tenant-scoped in DB)
  const seenBarcodes = new Set<string>();

  for (const row of items) {
    const legacyId = row.id ?? '';
    if (!legacyId) continue;

    const reusedId = await findMappedId(client, 'item', legacyId, 'product', 'product', opts.tenantId);
    if (reusedId) {
      productByItem.set(legacyId, reusedId);
      products.reused++;
      continue;
    }

    const code = (row.item_code ?? '').trim();
    if (!code) {
      rejects.push({ table: 'item', pk: legacyId, reasonCode: 'code_missing', reasonDetail: `item ${legacyId} has no item_code`, row });
      continue;
    }

    const barcode = (row.barcode ?? '').trim();
    if (barcode) {
      if (seenBarcodes.has(barcode)) {
        rejects.push({
          table: 'item',
          pk: legacyId,
          reasonCode: 'duplicate_barcode',
          reasonDetail: `barcode ${barcode} already seen in this run (legacy namespace)`,
          row,
        });
        continue;
      }
      const existing = await client.query(`SELECT 1 FROM product_barcode WHERE tenant_id = $1 AND barcode = $2`, [
        opts.tenantId,
        barcode,
      ]);
      if (existing.rowCount) {
        rejects.push({
          table: 'item',
          pk: legacyId,
          reasonCode: 'duplicate_barcode',
          reasonDetail: `barcode ${barcode} already exists in the target tenant`,
          row,
        });
        continue;
      }
      seenBarcodes.add(barcode);
    }

    // base unit: smallest surviving unit_total row; fallback tenant 'EA'
    const convRows = convByItem.get(legacyId) ?? [];
    let baseUnitId = unitMap.get('EA')!;
    let minScaled: bigint | null = null;
    for (const c of convRows) {
      const total = parseScaled(c.unit_total, 6);
      if (minScaled === null || total < minScaled) minScaled = total;
    }
    if (minScaled !== null && convRows.length > 0) {
      const baseRow = convRows.find((c) => parseScaled(c.unit_total, 6) === minScaled)!;
      baseUnitId = unitMap.get(baseRow.unit_id ?? '') ?? baseUnitId;
    }

    const sell = normalizeMoney(row.selling_price);
    if (sell.rounded) roundingWarnings.push(`item ${legacyId} selling_price rounded to 4dp`);
    const purch = normalizeMoney(row.purchase_price);
    if (purch.rounded) roundingWarnings.push(`item ${legacyId} purchase_price rounded to 4dp`);

    const category = categoryMap.get(row.category_id ?? '') ?? null;
    const supplier = supplierMap.get(row.supplier_id ?? '') ?? null;
    const status = (row.status ?? '').trim().toUpperCase() === 'ACTIVE' ? 'active' : 'inactive';

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO product (tenant_id, code, name, category_id, supplier_id, base_unit_id,
                            sold_in_units, selling_price, purchase_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [
        opts.tenantId,
        code,
        row.name ?? `Item ${legacyId}`,
        category,
        supplier,
        baseUnitId,
        (convByItem.get(legacyId) ?? []).length > 0,
        sell.value,
        purch.value === '0.0000' ? null : purch.value,
        status,
      ],
    );
    const productId = inserted.rows[0]!.id;
    productByItem.set(legacyId, productId);
    await writeLegacyMap(client, 'item', legacyId, 'product', productId, opts.runId);
    products.imported++;

    if (barcode) {
      await client.query(
        `INSERT INTO product_barcode (tenant_id, product_id, barcode, is_primary)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (tenant_id, barcode) DO NOTHING`,
        [opts.tenantId, productId, barcode],
      );
    }
  }

  // conversions: exact factors relative to each item's base row
  for (const [itemId, rows] of convByItem) {
    const productId = productByItem.get(itemId);
    if (!productId) {
      for (const row of rows) {
        rejects.push({
          table: 'units_items',
          pk: row.id ?? '',
          reasonCode: 'fk_orphan',
          reasonDetail: `units_items ${row.id ?? ''} references item ${itemId} which was not imported (quarantined upstream)`,
          row,
        });
      }
      continue;
    }
    const minScaled = rows.reduce<bigint | null>(
      (min, r) => {
        const v = parseScaled(r.unit_total, 6);
        return min === null || v < min ? v : min;
      },
      null,
    )!;
    const list: Array<{ productUnitId: string; unitId: string; factorScaled: bigint }> = [];
    // base unit factor is 1 by definition — must be tracked on re-runs too
    // (legacy `quantity` is expressed in the largest unit: the base itself
    // when the item has no larger package)
    let maxFactor = 10n ** 6n;
    let defaultSaleUnitId: string | null = null;

    for (const row of rows) {
      const unitId = unitMap.get(row.unit_id ?? '');
      if (!unitId) {
        rejects.push({
          table: 'units_items',
          pk: row.id ?? '',
          reasonCode: 'fk_orphan',
          reasonDetail: `units_items ${row.id ?? ''} references unknown unit ${row.unit_id ?? ''}`,
          row,
        });
        continue;
      }
      const totalScaled = parseScaled(row.unit_total, 6);
      let factorScaled: bigint;
      try {
        factorScaled = minScaled === totalScaled ? 10n ** 6n : divScaledExact(totalScaled * 10n ** 6n, minScaled);
      } catch (err) {
        if (err instanceof ExactnessError) {
          // non-terminating legacy ratio: documented rounding (map doc §5)
          factorScaled = divScaledRounded(totalScaled * 10n ** 6n, minScaled);
          roundingWarnings.push(
            `units_items ${row.id ?? ''} factor rounded to 6dp (non-terminating legacy ratio ${formatScaled(totalScaled, 6)}/${formatScaled(minScaled, 6)})`,
          );
        } else {
          throw err;
        }
      }
      if (totalScaled === minScaled) {
        // the base row itself: no product_unit row (factor 1 implicit)
        info.conversions.set(itemId, list);
        continue;
      }
      const price = normalizeMoney(row.unit_price);
      if (price.rounded) roundingWarnings.push(`units_items ${row.id ?? ''} unit_price rounded to 4dp`);
      const existing = await findMappedId(client, 'units_items', row.id ?? '', 'product_unit', 'product_unit', opts.tenantId);
      if (existing) {
        convStats.reused++;
        list.push({ productUnitId: existing, unitId, factorScaled });
        if (factorScaled > maxFactor) {
          maxFactor = factorScaled;
          defaultSaleUnitId = unitId;
        }
        continue;
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO product_unit (tenant_id, product_id, unit_id, conversion_factor, price)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (product_id, unit_id) DO UPDATE SET conversion_factor = EXCLUDED.conversion_factor
         RETURNING id`,
        [opts.tenantId, productId, unitId, formatScaled(factorScaled, 6), price.value === '0.0000' ? null : price.value],
      );
      await writeLegacyMap(client, 'units_items', row.id ?? '', 'product_unit', inserted.rows[0]!.id, opts.runId);
      convStats.imported++;
      list.push({ productUnitId: inserted.rows[0]!.id, unitId, factorScaled });
      if (factorScaled > maxFactor) {
        maxFactor = factorScaled;
        defaultSaleUnitId = unitId;
      }
    }
    info.conversions.set(itemId, list);
    info.maxFactorByItem.set(itemId, maxFactor);
    if (defaultSaleUnitId !== null) {
      await client.query(
        `UPDATE product SET default_sale_unit_id = $2, sold_in_units = true WHERE id = $1`,
        [productId, defaultSaleUnitId],
      );
    }
  }

  return { products, convStats, rejects, roundingWarnings, info };
}

/** Ensure a tenant exists helper is NOT here — engine owns tenant creation. */
export function newRunRef(): string {
  return randomUUID();
}
