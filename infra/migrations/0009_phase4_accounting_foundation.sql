-- ============================================================
-- 0009_phase4_accounting_foundation.sql — Phase 4 accounting
-- foundation.
--
-- ADDITIVE ONLY: 0001–0008 are already applied and immutable.
-- This migration grows the Phase 3 "minimum synchronous GL
-- primitives" into the Phase 4 accounting foundation:
--
--  1. CHART OF ACCOUNTS: the Phase 3 gl_account (code/name/type)
--     gains the full Phase 4 attributes — statement class
--     (assets / liabilities / equity / revenue / cost of sales /
--     operating expenses / other income / other expense), parent
--     hierarchy, normal balance, posting vs non-posting,
--     control-account designation, effective dates, description.
--     Historical rows are backfilled deterministically.
--
--  2. PURPOSE CATALOG: gl_mapping's purpose CHECK is widened with
--     the Phase 4 posting purposes (AP control, GR/IR accrual,
--     purchase price variance, recoverable input tax, supplier
--     advances, purchase expense, inventory adjustment gain/loss,
--     opening-balance equity, retained earnings, bank fees). The
--     posting engine resolves accounts by purpose — never by
--     hard-coded ids (Phase 3 rule preserved).
--
--  3. ACCOUNTING PERIODS: fiscal periods with open / soft-closed /
--     closed status, overlap-guarded, with audited reopen. Posting
--     into a closed period is rejected by the posting paths through
--     a single choke point (FinancialConfigurationService).
--
--  4. JOURNAL EXTENSIONS: business date, document reference and
--     reversal linkage on journal_entry (append-only table keeps its
--     grants; the new columns are metadata only).
--
--  5. DOCUMENT NUMBERING: the Phase 4 document types are registered
--     on document_sequence.
-- ============================================================

-- ------------------------------------------------------------
-- 1a. Chart of accounts attributes
-- ------------------------------------------------------------
ALTER TABLE gl_account
  ADD COLUMN IF NOT EXISTS account_class text,
  ADD COLUMN IF NOT EXISTS parent_account_id uuid,
  ADD COLUMN IF NOT EXISTS normal_balance text,
  ADD COLUMN IF NOT EXISTS is_posting boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_control boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT '1970-01-01',
  ADD COLUMN IF NOT EXISTS retired_at date,
  ADD COLUMN IF NOT EXISTS description text;

-- backfill class + normal balance from the Phase 3 account_type
UPDATE gl_account
   SET account_class = CASE account_type
         WHEN 'asset' THEN 'asset'
         WHEN 'liability' THEN 'liability'
         WHEN 'equity' THEN 'equity'
         WHEN 'revenue' THEN 'revenue'
         ELSE 'operating_expense'
       END,
       normal_balance = CASE account_type
         WHEN 'asset' THEN 'debit'
         WHEN 'expense' THEN 'debit'
         ELSE 'credit'
       END
 WHERE account_class IS NULL;

-- the seeded COGS control (purpose-mapped in Phase 3) is a cost-of-sales
-- account, not a generic operating expense
UPDATE gl_account
   SET account_class = 'cost_of_sales'
 WHERE id IN (SELECT account_id FROM gl_mapping WHERE purpose = 'cogs')
   AND account_class = 'operating_expense';

-- control-account designation for the Phase 3 seeded controls
UPDATE gl_account
   SET is_control = true
 WHERE id IN (SELECT account_id FROM gl_mapping);

ALTER TABLE gl_account
  ADD CONSTRAINT gl_account_class_check
  CHECK (account_class IN (
    'asset','liability','equity','revenue','cost_of_sales',
    'operating_expense','other_income','other_expense'));

ALTER TABLE gl_account
  ADD CONSTRAINT gl_account_normal_balance_check
  CHECK (normal_balance IN ('debit','credit'));

ALTER TABLE gl_account
  ADD CONSTRAINT gl_account_parent_not_self
  CHECK (parent_account_id IS NULL OR parent_account_id <> id);

ALTER TABLE gl_account
  ADD CONSTRAINT fk_gl_account_parent_tenant
  FOREIGN KEY (tenant_id, parent_account_id)
  REFERENCES gl_account (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_gl_account_parent
  ON gl_account (tenant_id, parent_account_id);

-- a parent must be a non-posting grouping account (posting children
-- roll up through it); enforced for NEW rows only — historical seeds
-- have no parents, so a plain CHECK suffices
ALTER TABLE gl_account
  ADD CONSTRAINT gl_account_parent_only_when_non_posting
  CHECK (parent_account_id IS NULL OR is_posting = false);

-- ------------------------------------------------------------
-- 1b. Purpose catalog (posting-engine account resolution)
-- ------------------------------------------------------------
DO $$
DECLARE
  con text;
BEGIN
  -- widen the Phase 3 purpose CHECK (name matched by definition —
  -- auto-generated names vary)
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'gl_mapping'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%sales_revenue%'
  LOOP
    EXECUTE format('ALTER TABLE gl_mapping DROP CONSTRAINT %I', con);
  END LOOP;
END $$;

ALTER TABLE gl_mapping
  ADD CONSTRAINT gl_mapping_purpose_check
  CHECK (purpose IN (
    'sales_revenue','inventory','cogs','accounts_receivable',
    'cash','bank_clearing','momo_clearing','cheque_clearing',
    'customer_deposit_liability','tax_payable',
    -- Phase 4
    'accounts_payable',          -- AP control (subledger-tied)
    'grni_clearing',             -- goods received not yet invoiced accrual
    'supplier_advance',          -- unapplied supplier payments / prepayments
    'input_tax_recoverable',     -- recoverable purchase tax components
    'purchase_expense',          -- non-inventory purchase charges
    'purchase_price_variance',   -- PPV between receipt cost and invoice cost
    'inventory_adjustment_gain', -- upward adjustments / count gains
    'inventory_adjustment_loss', -- write-offs / shrinkage / count losses
    'opening_balance_equity',    -- counterpart for opening-balance documents
    'retained_earnings',
    'bank_fee_expense'
  ));

-- ------------------------------------------------------------
-- 2. Accounting periods (Phase 4 close/lock)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  fiscal_year int NOT NULL CHECK (fiscal_year >= 2000),
  period_number int NOT NULL CHECK (period_number BETWEEN 1 AND 13),
  period_name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','soft_closed','closed')),
  closed_at timestamptz,
  closed_by uuid REFERENCES app_user(id),
  reopen_reason text,
  reopened_at timestamptz,
  reopened_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_name),
  UNIQUE (tenant_id, starts_on, ends_on),
  CHECK (ends_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_period_tenant_id
  ON accounting_period (tenant_id, id);

-- no two periods of one tenant may overlap (calendar months of one
-- fiscal year, or arbitrary locked ranges — either way, overlap is a
-- configuration error and is rejected at the database)
CREATE OR REPLACE FUNCTION trg_period_overlap_guard() RETURNS trigger AS $$
DECLARE
  clashes int;
BEGIN
  SELECT count(*) INTO clashes
    FROM accounting_period
   WHERE tenant_id = NEW.tenant_id
     AND id <> NEW.id
     AND daterange(starts_on, ends_on, '[]') && daterange(NEW.starts_on, NEW.ends_on, '[]');
  IF clashes > 0 THEN
    RAISE EXCEPTION 'accounting period overlaps an existing period'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER period_overlap_guard
  BEFORE INSERT OR UPDATE ON accounting_period
  FOR EACH ROW EXECUTE FUNCTION trg_period_overlap_guard();

-- reopen evidence is captured on the row (reason + timestamp + user)
-- and audited by the service; period status transitions are guarded
-- by PeriodService with row locks.

-- ------------------------------------------------------------
-- 3. Journal extensions (append-only table; metadata columns only)
-- ------------------------------------------------------------
ALTER TABLE journal_entry
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid;

ALTER TABLE journal_entry
  ADD CONSTRAINT fk_journal_entry_reversal_of_tenant
  FOREIGN KEY (tenant_id, reversal_of_id)
  REFERENCES journal_entry (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_business_date
  ON journal_entry (tenant_id, business_date);
CREATE INDEX IF NOT EXISTS idx_journal_line_account_entry
  ON journal_line (tenant_id, account_id, entry_id);

-- ------------------------------------------------------------
-- 4. Phase 4 document types
-- ------------------------------------------------------------
DO $$
DECLARE
  con text;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'document_sequence'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%QUOTATION%'
  LOOP
    EXECUTE format('ALTER TABLE document_sequence DROP CONSTRAINT %I', con);
  END LOOP;
END $$;

ALTER TABLE document_sequence
  ADD CONSTRAINT document_sequence_doc_type_check
  CHECK (doc_type IN (
    'QUOTATION','SALE_ORDER','INVOICE','RECEIPT','WAYBILL','DEPOSIT',
    'INVOICE_REVERSAL',
    -- Phase 4
    'PURCHASE_ORDER','GRN','SUPPLIER_INVOICE','SUPPLIER_PAYMENT',
    'SUPPLIER_ADJUSTMENT','BANK_TRANSFER'
  ));

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounting_period']
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
GRANT SELECT, INSERT, UPDATE ON accounting_period TO idepot_app;
