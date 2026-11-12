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
  { table: 'suppliers', columns: ['supplier_id', 'supplier_name', 'contact_person', 'mobile', 'phone', 'email', 'address', 'created_date', 'opening_balance', 'balance_due', 'opening_accounts_payable_id'], pk: 'supplier_id' },
  // Phase 4: purchasing / AP / banking / journals (reference-only)
  { table: 'purchase_order', columns: ['po_id', 'po_code', 'supplier_id', 'item_id', 'status', 'quantity', 'price', 'amount', 'grand_total', 'amount_paid', 'amount_due', 'track_code', 'item_balance', 'date_timestamp'], pk: 'po_id' },
  { table: 'accounts_payable', columns: ['accounts_payable_id', 'supplier_id', 'po_code', 'amount', 'amount_paid', 'amount_due', 'payment_method', 'payment_details', 'account_id', 'status', 'track_code', 'p_prev_paid', 'prev_paid', 'date_timestamp'], pk: 'accounts_payable_id' },
  { table: 'accounts', columns: ['account_id', 'name', 'account_type', 'opening_balance', 'current_balance', 'account_is_bank', 'account_is_transferrable'], pk: 'account_id' },
  { table: 'general_journal', columns: ['journal_id', 'journal', 'reference', 'po_code', 'so_code', 'invoice_code', 'supplier_id', 'customer_id', 'payment_id', 'debit_amount', 'credit_amount', 'account_name', 'account_balance', 'date_timestamp'], pk: 'journal_id' },
  { table: 'opening_stock_count', columns: ['id', 'item_id', 'store_id', 'counted_quantity', 'counted_by', 'counted_date'], pk: 'id' },
  // Phase 5: legacy returns subsystem — designed-but-DEAD DDL, staged so the
  // no-synthesis verification (transform-phase5) reads REAL row counts from
  // the dump instead of passing vacuously when the table is absent.
  // Column names mirror legacy/intake/2026-11-06/depot_schema_only_sanitized.sql.
  { table: 'return_reasons', columns: ['reason_id', 'reason_name', 'reason_description', 'requires_approval', 'is_active', 'sort_order', 'created_timestamp'], pk: 'reason_id' },
  { table: 'sales_returns', columns: ['return_id', 'return_code', 'original_so_code', 'original_invoice_code', 'customer_id', 'return_date', 'return_timestamp', 'return_reason_id', 'return_reason_description', 'return_status', 'total_items_returned', 'total_refund_amount', 'refund_method', 'refund_account_id', 'approved_by', 'approved_timestamp', 'processed_by', 'processed_timestamp', 'notes', 'internal_notes', 'track_code', 'created_by', 'created_timestamp', 'updated_by', 'updated_timestamp'], pk: 'return_id' },
  { table: 'sales_return_items', columns: ['return_item_id', 'return_id', 'original_so_item_id', 'item_id', 'quantity_returned', 'unit_price', 'total_amount', 'return_condition', 'restock_status', 'restock_location_id', 'restock_timestamp', 'notes'], pk: 'return_item_id' },
  { table: 'refund_transactions', columns: ['refund_id', 'return_id', 'refund_code', 'refund_amount', 'refund_method', 'refund_account_id', 'refund_status', 'transaction_reference', 'processed_by', 'processed_timestamp', 'notes', 'created_timestamp'], pk: 'refund_id' },
  { table: 'store_credits', columns: ['credit_id', 'customer_id', 'return_id', 'credit_code', 'credit_amount', 'balance_amount', 'credit_status', 'expiry_date', 'issued_timestamp', 'issued_by', 'notes'], pk: 'credit_id' },
  { table: 'returns_audit_trail', columns: ['audit_id', 'return_id', 'action_type', 'previous_status', 'new_status', 'action_description', 'performed_by', 'performed_timestamp', 'ip_address', 'user_agent'], pk: 'audit_id' },
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

export interface Phase5ReturnsStats {
  deadReturnsTablesFound: string[];
  deadReturnsRows: number;
  ordersScanned: number;
  pwgRowsScanned: number;
  ambiguityRecords: number;
  returnsSynthesized: 0;
  creditBalancesVerified: number;
  legacyStoreCreditsFound: number;
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
  /** Phase 4 purchasing/AP/banking import stats (additive). */
  phase4?: Phase4TransformStats;
  phase5?: Phase5ReturnsStats;
}

export interface Phase4TransformStats {
  purchaseOrdersImported: number;
  purchaseOrdersReused: number;
  supplierInvoicesImported: number;
  supplierInvoicesReused: number;
  supplierPaymentsImported: number;
  supplierPaymentsReused: number;
  bankAccountsImported: number;
  bankAccountsReused: number;
  supplierOpeningsImported: number;
  journalReferenceRows: number;
  r14Divergences: number;
  openingTbPosted: boolean;
  equityPlug: string;
  openingTbDebit: string;
  openingTbCredit: string;
  legacyIdMapRowsPhase4: number;
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
