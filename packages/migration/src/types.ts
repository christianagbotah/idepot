/** Migration engine contracts. Verbatim staging: every legacy cell is TEXT or NULL. */

export type LegacyCell = string | null;
export type LegacyRow = Record<string, LegacyCell>;

export interface TableSpec {
  /** legacy table name (= legacy_raw table name) */
  table: string;
  /** ordered columns to load (verbatim subset) */
  columns: string[];
  /** numeric PK column used for ordering */
  pk: string;
}

export const FIXTURE_TABLES: TableSpec[] = [
  { table: 'store', columns: ['id', 'name', 'status'], pk: 'id' },
  { table: 'item', columns: ['id', 'item_code', 'name', 'quantity', 'status', 'created_date', 'store_id', 'category_id', 'supplier_id', 'selling_price', 'purchase_price', 'unit_quantity', 'barcode'], pk: 'id' },
  { table: 'invoice', columns: ['id', 'invoice_code', 'amount', 'amount_paid', 'amount_due', 'status', 'created_date', 'store_id'], pk: 'id' },
  { table: 'payment', columns: ['id', 'receipt_code', 'invoice_id', 'amount', 'pay_method', 'created_date', 'store_id'], pk: 'id' },
  // Phase 2 master data & stock
  { table: 'item_main_category', columns: ['category_id', 'category_name'], pk: 'category_id' },
  { table: 'item_category', columns: ['category_id', 'main_id', 'category_name'], pk: 'category_id' },
  { table: 'units', columns: ['unit_id', 'unit_name'], pk: 'unit_id' },
  { table: 'units_items', columns: ['id', 'unit_id', 'item_id', 'unit_total', 'unit_price'], pk: 'id' },
  { table: 'customers', columns: ['customer_id', 'customer_name', 'contact_person', 'mobile', 'phone', 'email', 'customer_active', 'guest', 'address', 'created_date'], pk: 'customer_id' },
  { table: 'suppliers', columns: ['supplier_id', 'supplier_name', 'contact_person', 'mobile', 'phone', 'email', 'address', 'created_date'], pk: 'supplier_id' },
  { table: 'opening_stock_count', columns: ['id', 'item_id', 'store_id', 'counted_quantity', 'counted_by', 'counted_date'], pk: 'id' },
];

/** A legacy source: yields canonical row batches per table (staging backend). */
export interface LegacySource {
  readonly backend: 'mysql-protocol' | 'parsed-dump';
  readonly fingerprint: string;
  /** applies the dump to staging (if needed) and reads back ordered rows */
  readStagedRows(spec: TableSpec): Promise<LegacyRow[]>;
  close(): Promise<void>;
}

export interface ValidatorFinding {
  validator: string;
  table: string;
  pk: string;
  reasonCode: string;
  reasonDetail: string;
  severity: 'error' | 'warning';
  quarantine: boolean;
}

export interface ReconciliationRecord {
  legacy_table: string;
  legacy_id: string;
  field: string;
  legacy_stored_value: Record<string, unknown>;
  legacy_reconstructed_value: Record<string, unknown>;
  new_system_value: Record<string, unknown>;
  correction_delta: Record<string, unknown>;
  correction_reason: string;
  evidence: Record<string, unknown>;
  severity: string;
  requires_manual_approval: boolean;
}

export interface ReconciliationArtifact {
  runId: string;
  startedAt: string;
  finishedAt: string;
  sourceFingerprint: string;
  stagingBackend: string;
  tables: Array<{
    table: string;
    stagedRows: number;
    loadedRows: number;
    checksumStaging: string;
    checksumLegacyRaw: string;
    checksumMatch: boolean;
  }>;
  validators: Array<{ code: string; table: string; checked: number; failed: number }>;
  quarantine: { total: number; byReason: Record<string, number> };
  reconciliation: {
    summary: { records: number; flagged: number; requiresManualApproval: number };
    records: ReconciliationRecord[];
  };
  warnings: Array<{ code: string; table: string; message: string }>;
  transform: { storesImported: number; storesReused: number; legacyIdMapRows: number };
  /** Phase 2 master-data & opening-stock import stats (additive). */
  phase2?: Phase2TransformStats;
}

export interface Phase2TransformStats {
  categoriesImported: number;
  categoriesReused: number;
  unitsImported: number;
  unitsReused: number;
  productsImported: number;
  productsReused: number;
  conversionsImported: number;
  conversionsReused: number;
  customersImported: number;
  customersReused: number;
  suppliersImported: number;
  suppliersReused: number;
  openingStockDocs: number;
  openingStockDocsReused: number;
  openingStockMovements: number;
  openingStockRiskItems: number;
  openingStockVariances: number;
  legacyIdMapRowsPhase2: number;
}
