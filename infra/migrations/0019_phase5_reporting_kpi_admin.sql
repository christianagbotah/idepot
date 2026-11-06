-- ============================================================
-- 0019_phase5_reporting_kpi_admin.sql — Phase 5 reporting, KPI,
-- administration and the optional loyalty foundation.
--
-- ADDITIVE ONLY: 0001–0018 are already applied and immutable.
--
--  - kpi_snapshot: DERIVED, reproducible, idempotent snapshots. They
--    are never authoritative financial ledgers and never feed posting;
--    each carries its source watermark so staleness is explicit.
--  - kpi_target: effective-dated targets with achievement math done in
--    the service layer (zero-target handled explicitly).
--  - tenant_setting: versioned, effective-dated configuration (company
--    profile, document prefixes, return policies, module flags). New
--    versions are NEW rows — a configuration change can never rewrite
--    a historical posted document.
--  - loyalty foundation: feature-flagged OFF by default
--    (loyalty_program.is_active = false). The legacy loyalty DDL never
--    ran, so NOTHING is imported into these tables and no merchant is
--    enrolled until an explicit business decision activates a program.
--  - audit search indexes for the first-class audit query/export UX.
-- ============================================================

-- ------------------------------------------------------------
-- 1. KPI snapshots (derived; rebuildable; never authoritative)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  scope_type text NOT NULL DEFAULT 'tenant' CHECK (scope_type IN ('tenant','branch')),
  scope_id uuid,
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  metric text NOT NULL,
  metric_version int NOT NULL DEFAULT 1 CHECK (metric_version > 0),
  value numeric(18,4) NOT NULL,
  unit text NOT NULL DEFAULT 'money' CHECK (unit IN ('money','count','ratio','days')),
  -- the cutoff the calculation ran against (committed-fact watermark)
  source_watermark timestamptz NOT NULL,
  refresh_status text NOT NULL DEFAULT 'ok' CHECK (refresh_status IN ('ok','stale')),
  calculated_at timestamptz NOT NULL DEFAULT now()
  -- idempotency: one snapshot per (tenant, scope, period, metric,
  -- version) — enforced by the expression unique index below
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshot_lookup
  ON kpi_snapshot (tenant_id, metric, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshot_scope
  ON kpi_snapshot (tenant_id, scope_type, scope_id, period_start DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_snapshot_identity
  ON kpi_snapshot (
    tenant_id, scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start, period_end, metric, metric_version);

-- ------------------------------------------------------------
-- 2. KPI targets (effective-dated, audited; zero-target handled in
--    the service with explicit achievement semantics)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_target (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  metric text NOT NULL,
  scope_type text NOT NULL DEFAULT 'tenant' CHECK (scope_type IN ('tenant','branch')),
  scope_id uuid,
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  target_value numeric(18,4) NOT NULL CHECK (target_value >= 0),
  note text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
  -- one target per (tenant, metric, scope, period): expression unique
  -- index below (scope_id is NULL for tenant-wide targets)
);

CREATE INDEX IF NOT EXISTS idx_kpi_target_lookup
  ON kpi_target (tenant_id, metric, period_start DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_target_identity
  ON kpi_target (
    tenant_id, metric, scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start, period_end);

-- effective-period overlap guard (same shape as the tax-version guard)
CREATE OR REPLACE FUNCTION trg_kpi_target_overlap_guard() RETURNS trigger AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM kpi_target
    WHERE tenant_id = NEW.tenant_id
      AND metric = NEW.metric
      AND scope_type = NEW.scope_type
      AND COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(NEW.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND id <> NEW.id
      AND daterange(period_start, period_end, '[]')
          && daterange(NEW.period_start, NEW.period_end, '[]');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'kpi target overlap: a target already exists for this metric and period'
      USING ERRCODE = 'check_violation',
            DETAIL = format('metric=%s period=%s..%s', NEW.metric, NEW.period_start, NEW.period_end);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER kpi_target_overlap_guard
  BEFORE INSERT OR UPDATE ON kpi_target
  FOR EACH ROW EXECUTE FUNCTION trg_kpi_target_overlap_guard();

-- ------------------------------------------------------------
-- 3. Versioned tenant settings (administration & configuration)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  key text NOT NULL,
  value jsonb NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  note text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_tenant_setting_key
  ON tenant_setting (tenant_id, key, effective_from DESC);

-- effective-period overlap guard per (tenant, key)
CREATE OR REPLACE FUNCTION trg_tenant_setting_overlap_guard() RETURNS trigger AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM tenant_setting
    WHERE tenant_id = NEW.tenant_id
      AND key = NEW.key
      AND id <> NEW.id
      AND daterange(effective_from, COALESCE(effective_to, 'infinity'), '[)')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'), '[)');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'tenant setting overlap: this key already has a version effective in the requested period'
      USING ERRCODE = 'check_violation',
            DETAIL = format('key=%s effective=%s..%s', NEW.key, NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER tenant_setting_overlap_guard
  BEFORE INSERT OR UPDATE ON tenant_setting
  FOR EACH ROW EXECUTE FUNCTION trg_tenant_setting_overlap_guard();

-- ------------------------------------------------------------
-- 4. Loyalty foundation — feature-flagged OFF by default
--    (legacy loyalty DDL never ran: no history exists, nothing is
--    imported, no merchant is auto-enrolled)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  -- THE feature flag: false until an explicit, audited business
  -- decision activates the program
  is_active boolean NOT NULL DEFAULT false,
  -- earn policy: points awarded per currency unit of eligible posted sales
  points_per_currency numeric(9,6) NOT NULL DEFAULT 0 CHECK (points_per_currency >= 0),
  -- redemption policy: currency value of one point
  redemption_rate numeric(18,4) NOT NULL DEFAULT 0 CHECK (redemption_rate >= 0),
  min_redeem_points int CHECK (min_redeem_points IS NULL OR min_redeem_points > 0),
  points_expiry_days int CHECK (points_expiry_days IS NULL OR points_expiry_days > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- composite-FK target for account references
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_program_tenant_id
  ON loyalty_program (tenant_id, id);

CREATE TABLE IF NOT EXISTS loyalty_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  program_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  -- derived: Σ ledger entries; never directly mutated by money paths
  points_balance int NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, customer_id),
  CONSTRAINT fk_la_program_tenant FOREIGN KEY (tenant_id, program_id)
    REFERENCES loyalty_program (tenant_id, id),
  CONSTRAINT fk_la_customer_tenant FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customer (tenant_id, id)
);

-- composite-FK target for ledger references
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_account_tenant_id
  ON loyalty_account (tenant_id, id);

CREATE TABLE IF NOT EXISTS loyalty_points_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  account_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('earn','redeem','reverse','expire','adjust')),
  -- signed: earn > 0, redeem/reverse/expire < 0
  points int NOT NULL CHECK (points <> 0),
  source_kind text,
  source_id uuid,
  business_date date NOT NULL,
  note text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_kind, source_id, entry_type),
  CONSTRAINT fk_lpe_account_tenant FOREIGN KEY (tenant_id, account_id)
    REFERENCES loyalty_account (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_entry_account
  ON loyalty_points_entry (tenant_id, account_id, business_date);

-- ledger conservation: account balance == Σ entries (deferred)
CREATE OR REPLACE FUNCTION trg_loyalty_balance_guard() RETURNS trigger AS $$
DECLARE
  v_account uuid;
  v_balance int;
  v_ledger int;
BEGIN
  v_account := NEW.id;
  SELECT points_balance INTO v_balance FROM loyalty_account WHERE id = v_account;
  SELECT COALESCE(SUM(points), 0) INTO v_ledger FROM loyalty_points_entry
    WHERE account_id = v_account;
  IF v_balance <> v_ledger THEN
    RAISE EXCEPTION 'loyalty account balance does not match its ledger — points are only ever ledger-derived'
      USING ERRCODE = 'check_violation',
            DETAIL = format('balance=%s ledger=%s', v_balance, v_ledger);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER loyalty_balance_guard
  AFTER INSERT OR UPDATE OF points_balance ON loyalty_account
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_loyalty_balance_guard();

CREATE OR REPLACE FUNCTION trg_loyalty_entry_guard() RETURNS trigger AS $$
DECLARE
  v_account uuid;
  v_balance int;
  v_ledger int;
BEGIN
  v_account := CASE WHEN TG_OP = 'DELETE' THEN OLD.account_id ELSE NEW.account_id END;
  SELECT points_balance INTO v_balance FROM loyalty_account WHERE id = v_account;
  SELECT COALESCE(SUM(points), 0) INTO v_ledger FROM loyalty_points_entry
    WHERE account_id = v_account;
  IF v_balance <> v_ledger THEN
    RAISE EXCEPTION 'loyalty ledger diverges from the account balance — concurrent redemptions are serialized by the service lock'
      USING ERRCODE = 'check_violation',
            DETAIL = format('balance=%s ledger=%s', v_balance, v_ledger);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER loyalty_entry_guard
  AFTER INSERT OR UPDATE ON loyalty_points_entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_loyalty_entry_guard();

-- ------------------------------------------------------------
-- 5. Audit search indexes (comprehensive audit search/export UX)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_event (tenant_id, action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_event (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_event (tenant_id, actor_user_id, occurred_at DESC);

-- ------------------------------------------------------------
-- 6. RLS + grants
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kpi_snapshot','kpi_target','tenant_setting',
    'loyalty_program','loyalty_account','loyalty_points_entry']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

-- snapshots are derived projections: rebuildable, upsertable
GRANT SELECT, INSERT, UPDATE, DELETE ON kpi_snapshot TO idepot_app;
-- targets/configuration are mutable (audited at the service layer)
GRANT SELECT, INSERT, UPDATE, DELETE ON kpi_target TO idepot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_setting TO idepot_app;
-- loyalty foundation: inactive until an explicit business decision
GRANT SELECT, INSERT, UPDATE ON loyalty_program TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON loyalty_account TO idepot_app;
GRANT SELECT, INSERT ON loyalty_points_entry TO idepot_app;
