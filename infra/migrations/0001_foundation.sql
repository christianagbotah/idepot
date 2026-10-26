-- ============================================================
-- 0001_foundation.sql — product schema (Phase 1)
-- Tenancy (LOCKED shared-schema topology), auth, sample CRUD
-- resource, audit events, transactional outbox, posting sample.
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS warehouse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  branch_id uuid REFERENCES branch(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  roles text[] NOT NULL DEFAULT '{cashier}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  user_id uuid NOT NULL REFERENCES app_user(id),
  device_code text NOT NULL,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, device_code)
);

-- Reference subject for the Posting Coordinator / UoW atomicity tests (ADR-0001).
-- A real financial document (invoice/payment) arrives in Phase 3; the coordinator
-- mechanics are proven here on a document + audit + outbox posting set.
CREATE TABLE IF NOT EXISTS sample_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  total_amount numeric(18,4) NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_display text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  processed_at timestamptz,
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_event (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_event (status, occurred_at) WHERE status = 'pending';

-- ------------------------------------------------------------
-- Row Level Security: tenant isolation defense-in-depth (ADR-0003)
-- The application role (idepot_app, never table owner) is always subject
-- to RLS; the migration/ops admin role stays owner-bypass for bootstrap.
-- Session context is set per transaction: SET LOCAL app.tenant_id = '<uuid>'
-- ------------------------------------------------------------
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE device ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenant;
CREATE POLICY tenant_isolation ON tenant
  USING (id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation ON branch;
CREATE POLICY tenant_isolation ON branch
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation ON warehouse;
CREATE POLICY tenant_isolation ON warehouse
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation ON app_user;
CREATE POLICY tenant_isolation ON app_user
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation ON device;
CREATE POLICY tenant_isolation ON device
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation ON sample_document;
CREATE POLICY tenant_isolation ON sample_document
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation ON audit_event;
CREATE POLICY tenant_isolation ON audit_event
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation ON outbox_event;
CREATE POLICY tenant_isolation ON outbox_event
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ------------------------------------------------------------
-- Least-privilege grants for the application role.
-- Deliberately NOT granted: TRUNCATE, REFERENCES, TRIGGER, CREATE on schema.
-- (Enforced by test: app role must fail on TRUNCATE and CREATE TABLE.)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'idepot_app') THEN
    RAISE EXCEPTION 'role idepot_app must exist before migrations run (the migration runner creates it)';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO idepot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  tenant, branch, warehouse, app_user, device, sample_document, audit_event, outbox_event
  TO idepot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO idepot_app;
REVOKE CREATE ON SCHEMA public FROM idepot_app;
