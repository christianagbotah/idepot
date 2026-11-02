-- ============================================================
-- 0011_phase4_banking.sql — Phase 4 banking.
--
-- ADDITIVE ONLY. Corrected banking model (legacy-audit/payment
-- transaction-map §7): payment methods are no longer rows in the
-- legacy `accounts` table matched by NAME STRING; bank accounts are
-- first-class master data FK'd to the chart of accounts. Transfers
-- are atomic balanced documents with duplicate protection. Statement
-- import is fingerprinted (file + line), and reconciliation is an
-- explicit workflow — never a silent balance overwrite (defect D3 /
-- update_ables is structurally impossible here).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bank account master
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  bank_name text NOT NULL,
  branch text,
  account_name text NOT NULL,
  account_number text NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  gl_account_id uuid NOT NULL REFERENCES gl_account(id),
  is_active boolean NOT NULL DEFAULT true,
  opened_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_account_tenant_id
  ON bank_account (tenant_id, id);
ALTER TABLE bank_account
  ADD CONSTRAINT fk_bank_account_gl_tenant
  FOREIGN KEY (tenant_id, gl_account_id) REFERENCES gl_account (tenant_id, id);

-- ------------------------------------------------------------
-- 2. Bank transfers (atomic, balanced, duplicate-protected)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_transfer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  client_doc_id text,
  from_bank_account_id uuid NOT NULL REFERENCES bank_account(id),
  to_bank_account_id uuid NOT NULL REFERENCES bank_account(id),
  business_date date NOT NULL,
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  fee numeric(18,4) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  reference text,
  notes text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id),
  CHECK (from_bank_account_id <> to_bank_account_id)
  -- value conservation: the destination receives exactly the amount;
  -- the source is debited amount + fee; the fee is an explicit posted
  -- charge (Dr bank_fee_expense), never a hidden spread
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transfer_tenant_id
  ON bank_transfer (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_accounts
  ON bank_transfer (tenant_id, from_bank_account_id, to_bank_account_id, business_date DESC);
ALTER TABLE bank_transfer
  ADD CONSTRAINT fk_bank_transfer_from_tenant
  FOREIGN KEY (tenant_id, from_bank_account_id)
  REFERENCES bank_account (tenant_id, id);
ALTER TABLE bank_transfer
  ADD CONSTRAINT fk_bank_transfer_to_tenant
  FOREIGN KEY (tenant_id, to_bank_account_id)
  REFERENCES bank_account (tenant_id, id);

-- ------------------------------------------------------------
-- 3. Bank statements (import with fingerprinting + dedupe)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_statement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  bank_account_id uuid NOT NULL REFERENCES bank_account(id),
  statement_date date NOT NULL,
  filename text NOT NULL,
  file_sha256 text NOT NULL,
  row_count int NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid REFERENCES app_user(id),
  -- the same file content may only be imported once per account
  UNIQUE (tenant_id, bank_account_id, file_sha256)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_tenant_id
  ON bank_statement (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_account
  ON bank_statement (tenant_id, bank_account_id, statement_date DESC);
ALTER TABLE bank_statement
  ADD CONSTRAINT fk_bank_statement_account_tenant
  FOREIGN KEY (tenant_id, bank_account_id)
  REFERENCES bank_account (tenant_id, id);

CREATE TABLE IF NOT EXISTS bank_statement_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  bank_statement_id uuid NOT NULL REFERENCES bank_statement(id) ON DELETE CASCADE,
  -- denormalized from the parent statement so line-level dedupe is
  -- enforced per account with a plain unique constraint
  bank_account_id uuid NOT NULL REFERENCES bank_account(id),
  line_no int NOT NULL,
  value_date date NOT NULL,
  transaction_date date,
  reference text,
  description text,
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  closing_balance numeric(18,4),
  -- deterministic identity of the physical statement line: importing
  -- the same line again (same file re-uploaded, or the same entries
  -- appearing in an overlapping export) is a conflict, not a double
  line_fingerprint text NOT NULL,
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched','matched','excluded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_statement_id, line_no),
  UNIQUE (tenant_id, bank_account_id, line_fingerprint)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_line_tenant_id
  ON bank_statement_line (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_line_statement
  ON bank_statement_line (tenant_id, bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_line_status
  ON bank_statement_line (tenant_id, match_status, value_date);
ALTER TABLE bank_statement_line
  ADD CONSTRAINT fk_bank_statement_line_statement_tenant
  FOREIGN KEY (tenant_id, bank_statement_id)
  REFERENCES bank_statement (tenant_id, id);
ALTER TABLE bank_statement_line
  ADD CONSTRAINT fk_bank_statement_line_account_tenant
  FOREIGN KEY (tenant_id, bank_account_id)
  REFERENCES bank_account (tenant_id, id);

-- ------------------------------------------------------------
-- 4. Matching (manual + deterministic rules; suggestions NEVER
--    post accounting — a match only links evidence)
-- ------------------------------------------------------------
-- composite-FK target (0005 pattern) — 0008 did not add one here
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_line_tenant_id
  ON journal_line (tenant_id, id);

CREATE TABLE IF NOT EXISTS bank_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  bank_statement_line_id uuid NOT NULL REFERENCES bank_statement_line(id) ON DELETE CASCADE,
  journal_line_id uuid NOT NULL REFERENCES journal_line(id),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('manual','rule')),
  rule_name text,
  confidence numeric(5,4),
  matched_by uuid REFERENCES app_user(id),
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_statement_line_id, journal_line_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_match_line
  ON bank_match (tenant_id, bank_statement_line_id);
CREATE INDEX IF NOT EXISTS idx_bank_match_journal_line
  ON bank_match (tenant_id, journal_line_id);
ALTER TABLE bank_match
  ADD CONSTRAINT fk_bank_match_statement_line_tenant
  FOREIGN KEY (tenant_id, bank_statement_line_id)
  REFERENCES bank_statement_line (tenant_id, id);
ALTER TABLE bank_match
  ADD CONSTRAINT fk_bank_match_journal_line_tenant
  FOREIGN KEY (tenant_id, journal_line_id)
  REFERENCES journal_line (tenant_id, id);

-- a statement line may not be over-matched (Σ match amounts ≤ line
-- amount) — split/multi-match is supported up to the line value
CREATE OR REPLACE FUNCTION trg_bank_match_guard() RETURNS trigger AS $$
DECLARE
  v_line uuid;
  v_total numeric(18,4);
  v_amount numeric(18,4);
BEGIN
  v_line := CASE WHEN TG_OP = 'DELETE' THEN OLD.bank_statement_line_id ELSE NEW.bank_statement_line_id END;
  SELECT amount INTO v_amount FROM bank_statement_line WHERE id = v_line;
  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM bank_match WHERE bank_statement_line_id = v_line;
  IF v_total > v_amount THEN
    RAISE EXCEPTION 'bank match amounts exceed the statement line amount'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE CONSTRAINT TRIGGER bank_match_guard
  AFTER INSERT OR UPDATE OR DELETE ON bank_match
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_bank_match_guard();

-- ------------------------------------------------------------
-- 5. Reconciliation runs (explicit, evidence-preserving)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  bank_account_id uuid NOT NULL REFERENCES bank_account(id),
  as_of date NOT NULL,
  statement_closing_balance numeric(18,4),
  gl_closing_balance numeric(18,4),
  difference numeric(18,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','finalized')),
  notes text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalized_by uuid REFERENCES app_user(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_reconciliation_tenant_id
  ON bank_reconciliation (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_account
  ON bank_reconciliation (tenant_id, bank_account_id, as_of DESC);
ALTER TABLE bank_reconciliation
  ADD CONSTRAINT fk_bank_reconciliation_account_tenant
  FOREIGN KEY (tenant_id, bank_account_id)
  REFERENCES bank_account (tenant_id, id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_account','bank_transfer',
    'bank_statement','bank_statement_line',
    'bank_match','bank_reconciliation']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- Grants (least privilege)
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON bank_account TO idepot_app;
-- posted transfers are append-only evidence
GRANT SELECT, INSERT ON bank_transfer TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON bank_statement TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON bank_statement_line TO idepot_app;
GRANT SELECT, INSERT, DELETE ON bank_match TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON bank_reconciliation TO idepot_app;
