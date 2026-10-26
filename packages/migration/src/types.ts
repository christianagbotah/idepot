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
  { table: 'item', columns: ['id', 'item_code', 'name', 'quantity', 'status', 'created_date', 'store_id'], pk: 'id' },
  { table: 'invoice', columns: ['id', 'invoice_code', 'amount', 'amount_paid', 'amount_due', 'status', 'created_date', 'store_id'], pk: 'id' },
  { table: 'payment', columns: ['id', 'receipt_code', 'invoice_id', 'amount', 'pay_method', 'created_date', 'store_id'], pk: 'id' },
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
}
