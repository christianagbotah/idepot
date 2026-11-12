-- ============================================================
-- 0021_phase6_devices.sql — Phase 6 device administration,
-- pairing, licensing and replica bootstrap bookkeeping.
--
-- ADDITIVE ONLY: 0001–0020 are already applied and immutable.
--
--  - device gains: display name, branch binding, per-terminal
--    hardware profile (pos-hardware.md §3), app version telemetry,
--    last sync cursor + last_seen, pairing evidence. The Phase 1
--    columns (device_code/platform/status) are unchanged so the
--    auth registerDevice upsert keeps working.
--  - device_pairing_code: single-use, short-lived codes an
--    administrator issues to pair a NEW terminal/device to the
--    tenant (the code is presented in the desktop/mobile app once).
--  - device_license: per-device license seats (active/suspended/
--    revoked, optional validity) — administration surface for
--    licensing/session management; nothing auto-suspends.
--  - RLS tenant isolation on both new tables, like every other.
-- ============================================================

-- ------------------------------------------------------------
-- 1. device administration columns (additive)
-- ------------------------------------------------------------
ALTER TABLE device ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE device ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branch(id);
ALTER TABLE device ADD COLUMN IF NOT EXISTS hardware_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE device ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE device ADD COLUMN IF NOT EXISTS last_sync_cursor text;
ALTER TABLE device ADD COLUMN IF NOT EXISTS paired_at timestamptz;
ALTER TABLE device ADD COLUMN IF NOT EXISTS paired_by uuid REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_device_tenant_status ON device (tenant_id, status);

-- ------------------------------------------------------------
-- 2. one-time pairing codes (administrator-issued)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_pairing_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  branch_id uuid REFERENCES branch(id),
  -- optional pre-assigned hardware profile the paired device adopts
  hardware_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES app_user(id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_device_id uuid REFERENCES device(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE device_pairing_code ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON device_pairing_code;
CREATE POLICY tenant_isolation ON device_pairing_code
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ------------------------------------------------------------
-- 3. device license seats (administration-controlled)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_license (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  device_id uuid NOT NULL REFERENCES device(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  valid_until date,
  note text,
  issued_by uuid NOT NULL REFERENCES app_user(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, device_id)
);

ALTER TABLE device_license ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON device_license;
CREATE POLICY tenant_isolation ON device_license
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON device_pairing_code, device_license TO idepot_app;
