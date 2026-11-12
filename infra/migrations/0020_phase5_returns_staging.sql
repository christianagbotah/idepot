-- ============================================================
-- 0020_phase5_returns_staging.sql — Phase 5 returns-evidence staging.
--
-- ADDITIVE ONLY. Extends the DDL-owned legacy_raw staging schema
-- (0002/0003/0006/0013 pattern: verbatim TEXT staging, all columns
-- nullable, runtime stager must never CREATE) with the six legacy
-- returns-subsystem tables that the 2026-11-06 owner schema dump
-- (legacy/intake/2026-11-06/depot_schema_only_sanitized.sql) confirms
-- as designed-but-DEAD DDL:
--
--   return_reasons, sales_returns, sales_return_items,
--   refund_transactions, store_credits, returns_audit_trail
--
-- Why stage dead tables at all: the Phase 5 transform
-- (packages/migration/src/transform-phase5.ts) verifies the no-synthesis
-- contract — "the legacy returns subsystem never ran; any rows found are
-- untrusted evidence, quarantined, never imported". Without staging DDL
-- that verification is presence-conditional and therefore VACUOUS on a
-- real dump (information_schema finds no table, the check passes without
-- reading anything). Staging the empty tables makes the verification
-- REAL: row counts are read from the actual dump and any surprise rows
-- surface as manual-approval reconciliation records.
--
-- Columns mirror the legacy MariaDB DDL verbatim (column names only;
-- values stage as TEXT like every legacy_raw table).
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_raw.return_reasons (
  reason_id text,
  reason_name text,
  reason_description text,
  requires_approval text,
  is_active text,
  sort_order text,
  created_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.sales_returns (
  return_id text,
  return_code text,
  original_so_code text,
  original_invoice_code text,
  customer_id text,
  return_date text,
  return_timestamp text,
  return_reason_id text,
  return_reason_description text,
  return_status text,
  total_items_returned text,
  total_refund_amount text,
  refund_method text,
  refund_account_id text,
  approved_by text,
  approved_timestamp text,
  processed_by text,
  processed_timestamp text,
  notes text,
  internal_notes text,
  track_code text,
  created_by text,
  created_timestamp text,
  updated_by text,
  updated_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.sales_return_items (
  return_item_id text,
  return_id text,
  original_so_item_id text,
  item_id text,
  quantity_returned text,
  unit_price text,
  total_amount text,
  return_condition text,
  restock_status text,
  restock_location_id text,
  restock_timestamp text,
  notes text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.refund_transactions (
  refund_id text,
  return_id text,
  refund_code text,
  refund_amount text,
  refund_method text,
  refund_account_id text,
  refund_status text,
  transaction_reference text,
  processed_by text,
  processed_timestamp text,
  notes text,
  created_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.store_credits (
  credit_id text,
  customer_id text,
  return_id text,
  credit_code text,
  credit_amount text,
  balance_amount text,
  credit_status text,
  expiry_date text,
  issued_timestamp text,
  issued_by text,
  notes text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.returns_audit_trail (
  audit_id text,
  return_id text,
  action_type text,
  previous_status text,
  new_status text,
  action_description text,
  performed_by text,
  performed_timestamp text,
  ip_address text,
  user_agent text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);
