-- ============================================================
-- 0007_phase3_financial_hardening.sql — Phase 3 hardening round
-- (independent code review findings 1–5).
--
-- ADDITIVE ONLY: 0006 is already pushed, so its historical content is
-- never rewritten. This migration adds:
--
--  1. TAX ENGINE (review finding #1): effective-dated, versioned,
--     tenant-configurable tax profiles with named components. No statutory
--     rate is hard-coded anywhere — names and rates are configuration.
--     Every invoice stores immutable transaction-time evidence (profile
--     version, component names/rates, taxable basis, per-component amounts,
--     inclusive/exclusive treatment, exempt lines, totals).
--
--  2. MINIMUM SYNCHRONOUS GL PRIMITIVES (review finding #2): chart of
--     accounts (minimal), tenant purpose→account control mappings, and an
--     append-only journal (header + lines) with Σ debits == Σ credits
--     enforced in the domain builder AND at the database (constraint
--     trigger maintaining denormalized totals, checked on commit).
--
--  3. COST-BASIS POLICY (review finding #3, ADR-0004): effective-dated
--     tenant cost-policy versions (default method AVCO), cost-bearing
--     receipt layers on stock movements, and a rebuildable stock cost
--     state. invoice_line gains transaction-time cost evidence
--     (method, policy version, resolved unit cost, line COGS).
--
--  4. PRICE/DISCOUNT AUTHORIZATION CONFIG (review finding #4): materiality
--     thresholds for supervisor-approved overrides.
--
--  5. SYNC IDEMPOTENCY PAYLOAD IDENTITY (review finding #5): canonical
--     request fingerprint on sync_applied_event so the same key with a
--     DIFFERENT payload is a conflict, never a silent duplicate.
-- ============================================================

-- ------------------------------------------------------------
-- 1a. Tax profiles: effective-dated, versioned, configurable.
--     The engine never embeds statutory rates; tenants configure
--     components (name + rate + treatment). Versions are immutable once
--     created (append-only grants); a NEW version is how rates change.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
-- at most one default profile per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_profile_default
  ON tax_profile (tenant_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS tax_profile_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  profile_id uuid NOT NULL REFERENCES tax_profile(id),
  version int NOT NULL CHECK (version > 0),
  effective_from date NOT NULL,
  effective_to date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_profile_version_tenant_id
  ON tax_profile_version (tenant_id, id);
-- no overlapping effective windows for the same profile (versions are the
-- only lawful way to change rates — an in-place edit of a live version is
-- structurally rejected)
CREATE OR REPLACE FUNCTION trg_tax_version_overlap_guard() RETURNS trigger AS $$
DECLARE
  clashes int;
BEGIN
  SELECT count(*) INTO clashes
    FROM tax_profile_version
   WHERE profile_id = NEW.profile_id
     AND id <> NEW.id
     AND daterange(effective_from, effective_to, '[)') && daterange(NEW.effective_from, NEW.effective_to, '[)');
  IF clashes > 0 THEN
    RAISE EXCEPTION 'tax profile version overlaps an existing effective window for profile %', NEW.profile_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tax_version_overlap_guard
  BEFORE INSERT OR UPDATE ON tax_profile_version
  FOR EACH ROW EXECUTE FUNCTION trg_tax_version_overlap_guard();

CREATE TABLE IF NOT EXISTS tax_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  version_id uuid NOT NULL REFERENCES tax_profile_version(id) ON DELETE CASCADE,
  name text NOT NULL,
  rate numeric(9,6) NOT NULL CHECK (rate >= 0 AND rate < 1),
  inclusive boolean NOT NULL DEFAULT false,
  seq int NOT NULL DEFAULT 0,
  gl_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, name)
);
-- per-component payable account override is added after gl_account exists
-- (section 2a): see fk_tax_component_gl_account below.

-- ------------------------------------------------------------
-- 1b. Invoice tax evidence (immutable transaction-time snapshot).
--     tax_total = Σ ALL component amounts (evidence + display);
--     tax_inclusive_total = Σ components extracted from gross prices;
--     the payable total gains only the exclusive share:
--       total = subtotal − order_discount + tax_total − tax_inclusive_total
-- ------------------------------------------------------------
ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS tax_profile_version_id uuid REFERENCES tax_profile_version(id),
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_total numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive_total numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_profile_code text;

DO $$
DECLARE
  c text;
BEGIN
  -- drop the 0006 pre-tax identity. Constraint names are auto-generated, so
  -- match by DEFINITION: the unique check that asserts the total from
  -- subtotal and order_discount (pg_get_constraintdef renders e.g.
  -- "CHECK ((total = (subtotal - order_discount)))" — parens/casts vary by
  -- version, hence the regex). The order_discount <= subtotal check does not
  -- match (different operand order) and stays.
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'invoice'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ 'total[[:space:]]*=[[:space:]].*order_discount'
  LOOP
    EXECUTE format('ALTER TABLE invoice DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE invoice
  ADD CONSTRAINT invoice_total_tax_identity
  CHECK (total = subtotal - order_discount + tax_total - tax_inclusive_total);

-- per-component evidence rows (append-only: the corrected model never
-- rewrites a committed invoice's tax evidence)
CREATE TABLE IF NOT EXISTS invoice_tax_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  invoice_id uuid NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  component_id uuid REFERENCES tax_component(id),
  component_name text NOT NULL,
  rate numeric(9,6) NOT NULL,
  inclusive boolean NOT NULL,
  taxable_basis numeric(18,4) NOT NULL,
  tax_amount numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, component_name)
);

-- line-level applicability + basis evidence
ALTER TABLE invoice_line
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_basis numeric(18,4);

-- product-level exemption default (line-level flag ORs into it)
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 2a. Minimum GL primitives: chart of accounts + control mappings.
--     Phase 4 builds the full accounting product on this foundation;
--     Phase 3 needs exactly the sales/POS control accounts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL
    CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
-- target for tenant-aware composite FKs (0005 pattern)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_account_tenant_id ON gl_account (tenant_id, id);
-- tax components may carry their own payable account override
ALTER TABLE tax_component
  ADD CONSTRAINT fk_tax_component_gl_account
  FOREIGN KEY (tenant_id, gl_account_id) REFERENCES gl_account (tenant_id, id);

CREATE TABLE IF NOT EXISTS gl_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  purpose text NOT NULL,
  account_id uuid NOT NULL REFERENCES gl_account(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, purpose),
  CHECK (purpose IN (
    'sales_revenue','inventory','cogs','accounts_receivable',
    'cash','bank_clearing','momo_clearing','cheque_clearing',
    'customer_deposit_liability','tax_payable'
  ))
);
ALTER TABLE gl_mapping
  ADD CONSTRAINT fk_gl_mapping_account_tenant
  FOREIGN KEY (tenant_id, account_id) REFERENCES gl_account (tenant_id, id);

-- ------------------------------------------------------------
-- 2b. Append-only journal. Σ debits == Σ credits is enforced by:
--     (a) the domain JournalBuilder (exact decimal, pre-insert), and
--     (b) this database guard: journal_entry.total_debit/total_credit are
--         maintained by a SECURITY DEFINER constraint trigger that
--         recomputes them from journal_line at commit; the CHECK on the
--         header aborts any transaction whose final state is unbalanced.
--     Deferred so multi-line journals insert line-by-line safely.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  event text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  total_debit numeric(18,4) NOT NULL DEFAULT 0,
  total_credit numeric(18,4) NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, source_kind, source_id, event),
  CHECK (total_debit >= 0 AND total_credit >= 0),
  CHECK (total_debit = total_credit)
);

CREATE TABLE IF NOT EXISTS journal_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  entry_id uuid NOT NULL REFERENCES journal_entry(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES gl_account(id),
  debit numeric(18,4) NOT NULL DEFAULT 0,
  credit numeric(18,4) NOT NULL DEFAULT 0,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
ALTER TABLE journal_line
  ADD CONSTRAINT fk_journal_line_account_tenant
  FOREIGN KEY (tenant_id, account_id) REFERENCES gl_account (tenant_id, id);

CREATE OR REPLACE FUNCTION trg_journal_balance_guard() RETURNS trigger AS $$
DECLARE
  v_entry uuid;
  d numeric(18,4);
  c numeric(18,4);
BEGIN
  v_entry := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO d, c
    FROM journal_line WHERE entry_id = v_entry;
  UPDATE journal_entry SET total_debit = d, total_credit = c WHERE id = v_entry;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER journal_balance_guard
  AFTER INSERT OR UPDATE OR DELETE ON journal_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_journal_balance_guard();

-- ------------------------------------------------------------
-- 3a. Cost-basis policy (ADR-0004): effective-dated versions, default
--     method AVCO. Method changes that would alter historical accounting
--     require a new effective-dated version + migration/accounting
--     sign-off (ADR-0004; there is no in-place method switch).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_policy_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  version int NOT NULL CHECK (version > 0),
  method text NOT NULL CHECK (method IN ('avco')),
  effective_from date NOT NULL,
  effective_to date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_policy_version_tenant_id
  ON cost_policy_version (tenant_id, id);
CREATE OR REPLACE FUNCTION trg_cost_policy_overlap_guard() RETURNS trigger AS $$
DECLARE
  clashes int;
BEGIN
  SELECT count(*) INTO clashes
    FROM cost_policy_version
   WHERE tenant_id = NEW.tenant_id
     AND id <> NEW.id
     AND daterange(effective_from, effective_to, '[)') && daterange(NEW.effective_from, NEW.effective_to, '[)');
  IF clashes > 0 THEN
    RAISE EXCEPTION 'cost policy version overlaps an existing effective window'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cost_policy_overlap_guard
  BEFORE INSERT OR UPDATE ON cost_policy_version
  FOR EACH ROW EXECUTE FUNCTION trg_cost_policy_overlap_guard();

-- cost-bearing receipt layers on the append-only ledger; issues store the
-- resolved AVCO evidence; reversals copy the original exactly
ALTER TABLE stock_movement
  ADD COLUMN IF NOT EXISTS unit_cost numeric(18,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  ADD COLUMN IF NOT EXISTS cost_value numeric(18,4) CHECK (cost_value IS NULL OR cost_value >= 0);

-- rebuildable AVCO state per (tenant, warehouse, product); maintained by
-- the StockPoster inside the posting transaction, derivable from the
-- ledger (cost_value on movements)
CREATE TABLE IF NOT EXISTS stock_cost_state (
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  product_id uuid NOT NULL REFERENCES product(id),
  quantity_base numeric(18,6) NOT NULL DEFAULT 0,
  total_value numeric(18,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, warehouse_id, product_id),
  CHECK (total_value >= 0)
);

-- transaction-time cost evidence on sale lines
ALTER TABLE invoice_line
  ADD COLUMN IF NOT EXISTS cost_method text
    CHECK (cost_method IS NULL OR cost_method IN ('avco','purchase_price_fallback','legacy_import')),
  ADD COLUMN IF NOT EXISTS cost_policy_version_id uuid REFERENCES cost_policy_version(id),
  ADD COLUMN IF NOT EXISTS cogs numeric(18,4);
ALTER TABLE invoice_line
  ADD CONSTRAINT fk_invoice_line_cost_policy_tenant
  FOREIGN KEY (tenant_id, cost_policy_version_id)
  REFERENCES cost_policy_version (tenant_id, id);
ALTER TABLE invoice
  ADD CONSTRAINT fk_invoice_tax_version_tenant
  FOREIGN KEY (tenant_id, tax_profile_version_id)
  REFERENCES tax_profile_version (tenant_id, id);

-- ------------------------------------------------------------
-- 4. Override materiality thresholds (review finding #4). Zero means
--     permission + reason is sufficient; a positive threshold additionally
--     requires supervisor approval (credentials verified server-side) for
--     any override whose |delta| exceeds it.
-- ------------------------------------------------------------
ALTER TABLE tenant_config
  ADD COLUMN IF NOT EXISTS price_override_threshold numeric(18,4) NOT NULL DEFAULT 0
    CHECK (price_override_threshold >= 0),
  ADD COLUMN IF NOT EXISTS discount_override_threshold numeric(18,4) NOT NULL DEFAULT 0
    CHECK (discount_override_threshold >= 0);

-- ------------------------------------------------------------
-- 5. Sync idempotency payload identity (review finding #5): canonical
--    request fingerprint. Same key + same fingerprint → duplicate replay;
--    same key + DIFFERENT fingerprint → conflict (idempotency_key_reuse),
--    never a silent second application. NULL for pre-0007 rows = legacy
--    duplicate semantics (compat).
-- ------------------------------------------------------------
ALTER TABLE sync_applied_event
  ADD COLUMN IF NOT EXISTS payload_fingerprint text;

-- ------------------------------------------------------------
-- Query indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoice_tax_component
  ON invoice_tax_component (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_source
  ON journal_entry (tenant_id, source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_line_entry
  ON journal_line (tenant_id, entry_id);
CREATE INDEX IF NOT EXISTS idx_tax_version_profile
  ON tax_profile_version (tenant_id, profile_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_gl_mapping_tenant
  ON gl_mapping (tenant_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tax_profile','tax_profile_version','tax_component',
    'invoice_tax_component',
    'gl_account','gl_mapping','journal_entry','journal_line',
    'cost_policy_version','stock_cost_state']
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
-- configurable tax/GL/policy data
GRANT SELECT, INSERT, UPDATE ON
  tax_profile, gl_account, gl_mapping, cost_policy_version
  TO idepot_app;
-- immutable once created: component rates and evidence rows, journal.
-- tax_profile_version carries NO rate data (rates live in tax_component,
-- append-only) — its UPDATE grant exists ONLY so the service can close the
-- previous effective window when superseding it with a new version; the
-- overlap guard still rejects any overlapping window.
GRANT SELECT, INSERT, UPDATE ON
  tax_profile_version
  TO idepot_app;
GRANT SELECT, INSERT ON
  tax_component,
  invoice_tax_component,
  journal_entry, journal_line
  TO idepot_app;
-- AVCO state is a rebuildable projection maintained by the poster
GRANT SELECT, INSERT, UPDATE ON stock_cost_state TO idepot_app;
