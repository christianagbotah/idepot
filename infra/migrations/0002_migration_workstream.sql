-- ============================================================
-- 0002_migration_workstream.sql — legacy migration engineering
-- foundation (Phase 1). OWNED BY THE MIGRATION WORKSTREAM.
--
-- `legacy_raw` is verbatim staging: every column is TEXT, values are
-- parsed only during transform, never at load. Ownership contract
-- (LOCKED): this DDL layer owns creation of the schema and its tables;
-- the runtime stager assumes existence and MUST FAIL FAST if absent —
-- it never issues CREATE SCHEMA / CREATE TABLE.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS legacy_raw;

COMMENT ON SCHEMA legacy_raw IS
  'Verbatim legacy staging. Owned by the migration workstream DDL; runtime code must never create or alter it.';

CREATE TABLE IF NOT EXISTS legacy_raw.store (
  id text, name text, status text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.item (
  id text, item_code text, name text, quantity text, status text,
  created_date text, store_id text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.invoice (
  id text, invoice_code text, amount text, amount_paid text, amount_due text,
  status text, created_date text, store_id text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.payment (
  id text, receipt_code text, invoice_id text, amount text, pay_method text,
  created_date text, store_id text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON SCHEMA legacy_raw FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA legacy_raw FROM PUBLIC;
-- Migration CLI runs with an admin connection (COPY + registry writes).
-- The app role receives read-only introspection access only.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'idepot_app') THEN
    GRANT USAGE ON SCHEMA legacy_raw TO idepot_app;
    GRANT SELECT ON ALL TABLES IN SCHEMA legacy_raw TO idepot_app;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- Migration run registry: dump fingerprint, per-stage status, stats.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS migration_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  source_fingerprint text NOT NULL,
  staging_backend text NOT NULL,
  command text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);

-- ------------------------------------------------------------
-- Legacy-ID mapping: (legacy_table, legacy_id) -> target entity.
-- Stable across re-runs; idempotency is enforced via PRIMARY KEY.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_id_map (
  legacy_table text NOT NULL,
  legacy_id text NOT NULL,
  target_table text NOT NULL,
  target_id text NOT NULL,
  run_id uuid NOT NULL REFERENCES migration_run(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (legacy_table, legacy_id, target_table)
);

-- ------------------------------------------------------------
-- Quarantine: unparsable / orphan / inconsistent rows withheld WITH
-- reasons — never silently dropped (migration-reconciliation-strategy §3).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quarantine_row (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES migration_run(id),
  legacy_table text NOT NULL,
  legacy_pk text NOT NULL,
  src_row_number bigint,
  reason_code text NOT NULL,
  reason_detail text NOT NULL,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('error','warning')),
  row_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, legacy_table, legacy_pk, reason_code)
);

-- ------------------------------------------------------------
-- Correction-aware reconciliation records (strategy doc §3a).
-- The system NEVER silently repairs legacy figures.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES migration_run(id),
  legacy_table text NOT NULL,
  legacy_id text NOT NULL,
  field text NOT NULL,
  legacy_stored_value jsonb NOT NULL,
  legacy_reconstructed_value jsonb NOT NULL,
  new_system_value jsonb NOT NULL,
  correction_delta jsonb NOT NULL,
  correction_reason text NOT NULL,
  evidence jsonb NOT NULL,
  severity text NOT NULL,
  requires_manual_approval boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, legacy_table, legacy_id, field)
);

GRANT SELECT ON migration_run, legacy_id_map, quarantine_row, reconciliation_record TO idepot_app;
