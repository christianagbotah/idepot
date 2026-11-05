-- ============================================================
-- 0014_phase4_review_hardening.sql — second independent review
-- round (accounting corrections, head 48dc6f5 → this branch).
--
-- ADDITIVE ONLY: 0001–0013 are already applied and immutable.
--
-- 1. PURPOSE CATALOG: adds `inventory_in_transit` — internal stock
--    transfers carry their AVCO value in a dedicated asset control
--    while the goods are between warehouses (dispatch: Dr in-transit /
--    Cr inventory; receipt: the exact inverse). The movement is
--    inventory ↔ inventory and must NEVER touch revenue, expense or
--    profit. The per-tenant account + mapping rows are provisioned
--    idempotently at posting time by FinancialConfigurationService
--    (ensureDefaults), exactly like every other purpose — this file
--    only widens the catalog CHECK that guards the purpose column.
--
-- 2. REPORTING INDEX: journal business-date coverage for the as-of
--    statement scans (AP aging / reconciliation windows) — a plain
--    index, no data changes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Purpose catalog: widen the Phase 4 CHECK
-- ------------------------------------------------------------
DO $$
DECLARE
  con text;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'gl_mapping'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%grni_clearing%'
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
    'bank_fee_expense',
    -- review hardening
    'inventory_in_transit'       -- stock between warehouses (value only)
  ));

-- ------------------------------------------------------------
-- 2. Note on reporting indexes
-- ------------------------------------------------------------
-- The as-of statement scans filter on
--   COALESCE(business_date, occurred_at::date)
-- An expression index over that cast is impossible (timestamptz→date is
-- STABLE, not IMMUTABLE — timezone-dependent), so the planner uses the
-- plain (tenant_id, business_date) index from 0009 plus the source-kind
-- index from 0007; at Phase 4 data volumes these scans are purpose- and
-- supplier-filtered and bounded by the statement windows. No change.
