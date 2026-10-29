-- ============================================================
-- 0004_phase2_inventory.sql — Phase 2: append-only stock ledger,
-- derived balances, counts, adjustments, transfers.
--
-- THE LEDGER IS THE ONLY SOURCE OF TRUTH (kills the legacy I1 class:
-- stock replicated across ≥7 drifting mutable stores). stock_balance is
-- a rebuildable projection: on_hand == Σ stock movements is enforced by
-- the rebuild job and proven by invariant tests. stock_movement rows are
-- immutable: the app role gets SELECT/INSERT only (no UPDATE/DELETE).
-- ============================================================

-- ------------------------------------------------------------
-- Stock counts (draft → counted → approved | cancelled)
-- authority per migration strategy §4 (count-first opening stock)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_count (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','counted','approved','cancelled')),
  authority text NOT NULL DEFAULT 'system_entry'
    CHECK (authority IN ('physical_count','legacy_quantity','system_entry')),
  accepted_migration_risk boolean NOT NULL DEFAULT false,
  source_evidence text,
  counted_by text,
  counted_at timestamptz,
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS stock_count_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  count_id uuid NOT NULL REFERENCES stock_count(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  counted_quantity_base numeric(18,6),
  system_quantity_base numeric(18,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);

-- ------------------------------------------------------------
-- Stock adjustments (posted documents; reasons mandatory)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
  reason text NOT NULL,
  source_count_id uuid REFERENCES stock_count(id),
  posted_by uuid REFERENCES app_user(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS stock_adjustment_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  adjustment_id uuid NOT NULL REFERENCES stock_adjustment(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base <> 0),
  note text,
  UNIQUE (adjustment_id, product_id)
);

-- ------------------------------------------------------------
-- Transfers (location → location, in-transit state, partial receipt;
-- CHECKs prevent over-receipt and self-transfers; the receiver can never
-- exceed the dispatched quantity — no silent quantity disappearance)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transfer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  from_warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  to_warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_transit','received','cancelled')),
  dispatched_at timestamptz,
  dispatched_by uuid REFERENCES app_user(id),
  received_at timestamptz,
  received_by uuid REFERENCES app_user(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS transfer_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  transfer_id uuid NOT NULL REFERENCES transfer(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  received_quantity_base numeric(18,6) NOT NULL DEFAULT 0 CHECK (received_quantity_base >= 0),
  UNIQUE (transfer_id, product_id),
  CHECK (received_quantity_base <= quantity_base)
);

-- ------------------------------------------------------------
-- THE append-only stock ledger. Signed base-unit quantities:
-- on_hand(product, warehouse) == Σ quantity_base. Cross-unit movements
-- store the transacted unit/quantity/factor next to the base quantity so
-- every conversion is exactly reconcilable:
--   quantity_base == quantity_transacted × conversion_factor
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  product_id uuid NOT NULL REFERENCES product(id),
  movement_type text NOT NULL
    CHECK (movement_type IN ('receipt','issue','transfer_out','transfer_in',
                             'adjustment','count_variance','reversal')),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base <> 0),
  unit_id uuid REFERENCES unit(id),
  quantity_transacted numeric(18,6) CHECK (quantity_transacted IS NULL OR quantity_transacted <> 0),
  conversion_factor numeric(18,6) CHECK (conversion_factor IS NULL OR conversion_factor > 0),
  reason text,
  source_document_type text,
  source_document_id uuid,
  transfer_id uuid REFERENCES transfer(id),
  reversal_of uuid REFERENCES stock_movement(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movement_position
  ON stock_movement (tenant_id, product_id, warehouse_id, occurred_at, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movement_source
  ON stock_movement (tenant_id, source_document_type, source_document_id);
CREATE INDEX IF NOT EXISTS idx_stock_movement_transfer
  ON stock_movement (transfer_id) WHERE transfer_id IS NOT NULL;

-- ------------------------------------------------------------
-- Derived balance projection (rebuildable; never authoritative).
-- Non-negative: issues that would overdraw are rejected at posting time
-- under a row lock (configurable oversell policy arrives with offline
-- sync in Phase 3 — until then fail loud).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  product_id uuid NOT NULL REFERENCES product(id),
  quantity_base numeric(18,6) NOT NULL DEFAULT 0 CHECK (quantity_base >= 0),
  bin text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, product_id)
);

-- ------------------------------------------------------------
-- RLS + grants. stock_movement is append-only for the app role.
-- ------------------------------------------------------------
ALTER TABLE stock_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balance ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_count','stock_count_line','stock_adjustment',
                           'stock_adjustment_line','transfer','transfer_line',
                           'stock_movement','stock_balance']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  stock_count, stock_count_line, stock_adjustment, stock_adjustment_line,
  transfer, transfer_line, stock_balance
  TO idepot_app;
-- append-only ledger: no UPDATE, no DELETE, no TRUNCATE for the app role
GRANT SELECT, INSERT ON stock_movement TO idepot_app;
