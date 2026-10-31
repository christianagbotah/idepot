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
  // Phase 3: invoice/payment specs extended with the sales-cycle columns
  // (legacy rows without them stage as NULL — checksums stay self-consistent)
  { table: 'invoice', columns: ['id', 'invoice_code', 'so_code', 'customer_id', 'amount', 'amount_paid', 'amount_due', 'status', 'created_date', 'store_id', 'date_timestamp', 'track_code', 'opening_entry'], pk: 'id' },
  { table: 'payment', columns: ['id', 'receipt_code', 'invoice_id', 'amount', 'pay_method', 'created_date', 'store_id', 'payment_type', 'category', 'customer_id', 'invoice_code', 'so_code', 'method_account', 'bank_name', 'branch', 'cheque_number', 'momo_phone', 'momo_transaction_id', 'momo_type', 'track_code', 'cash_sales_in_payables', 'due'], pk: 'id' },
  // Phase 3 sales cycle
  { table: 'sales_order', columns: ['id', 'so_code', 'customer_id', 'item_id', 'quantity', 'quantity_picked', 'price', 'amount', 'grand_total', 'amount_paid', 'amount_due', 'status', 'type_of_sales', 'negative_or_goods', 'opening_entry', 'cost_price', 'item_balance', 'total_quantity', 'order_item_has_unit_sales', 'bundle_quantity', 'bundle_price', 'date_timestamp', 'track_code', 'created_by'], pk: 'id' },
  { table: 'payment_with_goods', columns: ['id', 'so_code', 'customer_id', 'item_id', 'quantity', 'quantity_picked', 'quantity_due', 'price', 'amount', 'grand_total', 'amount_paid', 'amount_due', 'status', 'type_of_sales', 'waybill_code', 'invoice_code', 'date_timestamp', 'track_code'], pk: 'id' },
  { table: 'proforma_invoice', columns: ['id', 'invoice_code', 'so_code', 'customer_id', 'amount', 'date_timestamp'], pk: 'id' },
  { table: 'proforma_invoice_order', columns: ['id', 'so_code', 'item_id', 'quantity', 'price', 'amount', 'unit_or_package'], pk: 'id' },
  { table: 'cash_deposit_disbursement', columns: ['id', 'so_code', 'invoice_code', 'deposit_code', 'amount', 'date_timestamp'], pk: 'id' },
  { table: 'invoice_code', columns: ['id', 'code', 'status', 'reason', 'customer_id', 'code_range', 'created_by', 'created_date'], pk: 'id' },
  { table: 'waybill_code', columns: ['id', 'code', 'status', 'reason', 'customer_id', 'code_range', 'created_by', 'created_date'], pk: 'id' },
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
  /** Phase 3 sales-cycle import stats (additive). */
  phase3?: Phase3TransformStats;
}

export interface Phase3TransformStats {
  ordersImported: number;
  ordersReused: number;
  invoicesImported: number;
  invoicesReused: number;
  paymentsImported: number;
  paymentsReused: number;
  depositsImported: number;
  depositsReused: number;
  creditApplications: number;
  quotationsImported: number;
  quotationsReused: number;
  waybillsImported: number;
  waybillsReused: number;
  bookletCodesImported: number;
  r14Divergences: number;
  r8DiscountMismatches: number;
  d1MultiaccountReconstructions: number;
  legacyIdMapRowsPhase3: number;
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
