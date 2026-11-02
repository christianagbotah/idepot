-- ============================================================
-- 0013_phase4_migration_staging.sql — Phase 4 migration workstream.
--
-- ADDITIVE ONLY. Extends the DDL-owned legacy_raw staging schema
-- (0002/0003/0006 pattern: verbatim TEXT staging, all columns nullable,
-- runtime stager must never CREATE) with the Phase 4 legacy tables:
--
--   purchase_order    (legacy collapsed PO+GRN+invoice, row per line)
--   accounts_payable  (legacy AP ledger rows incl. 'Opening-balance')
--   accounts          (legacy chart-of-accounts-as-payment-methods)
--   general_journal   (legacy GL — imported as REFERENCE ONLY, never
--                      canonical truth; strategy doc D8/D9)
--
-- The suppliers staging table gains the opening-balance columns the
-- Phase 4 opening-balance transform reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_raw.purchase_order (
  po_id text,
  po_code text,
  supplier_id text,
  item_id text,
  status text,
  quantity text,
  price text,
  amount text,
  grand_total text,
  amount_paid text,
  amount_due text,
  track_code text,
  item_balance text,
  date_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.accounts_payable (
  accounts_payable_id text,
  supplier_id text,
  po_code text,
  amount text,
  amount_paid text,
  amount_due text,
  payment_method text,
  payment_details text,
  account_id text,
  status text,
  track_code text,
  p_prev_paid text,
  prev_paid text,
  date_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.accounts (
  account_id text,
  name text,
  account_type text,
  opening_balance text,
  current_balance text,
  account_is_bank text,
  account_is_transferrable text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.general_journal (
  journal_id text,
  journal text,
  reference text,
  po_code text,
  so_code text,
  invoice_code text,
  supplier_id text,
  customer_id text,
  payment_id text,
  debit_amount text,
  credit_amount text,
  account_name text,
  account_balance text,
  date_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE legacy_raw.suppliers
  ADD COLUMN IF NOT EXISTS opening_balance text,
  ADD COLUMN IF NOT EXISTS balance_due text,
  ADD COLUMN IF NOT EXISTS opening_accounts_payable_id text;

CREATE INDEX IF NOT EXISTS idx_legacy_raw_purchase_order_code
  ON legacy_raw.purchase_order (po_code);
CREATE INDEX IF NOT EXISTS idx_legacy_raw_accounts_payable_supplier
  ON legacy_raw.accounts_payable (supplier_id);
CREATE INDEX IF NOT EXISTS idx_legacy_raw_general_journal_codes
  ON legacy_raw.general_journal (po_code, so_code, invoice_code);

-- staging tables carry no tenant context (they are verbatim legacy
-- evidence quarantined from the RLS-subject business schema)
