-- ============================================================
-- 0022_phase7a_intelligence.sql — Phase 7a rules-based
-- intelligence: alert foundation (ai-opportunity-map.md §2
-- foundations + §3 phasing: tier 7a is rules-based and runs
-- inside the existing API — no external AI service yet).
--
-- ADDITIVE ONLY: 0001–0021 are already applied and immutable.
--
--  - ai_model_run: every rule evaluation is a versioned,
--    auditable run (rule id + version, exact config + config
--    hash, input window, alerts created/suppressed, status).
--    This is the auditability foundation the opportunity map
--    demands before ANY prediction tier (7b+) ships.
--  - ai_alert: the investigation queue. Alert-ONLY by design
--    (master prompt rule 14): an alert never posts, never
--    mutates financial state, never auto-acts. Lifecycle:
--    open → acknowledged → resolved | dismissed, always by a
--    human with intelligence:manage. Re-scans dedupe against
--    open/acknowledged alerts (partial unique index) and
--    refresh their evidence instead of spamming the queue.
--  - ai_feedback: the human loop (opportunity map §4) — every
--    alert can be marked useful/not with a reason; one row per
--    (user, alert), upserted.
--  - RLS tenant isolation on all three tables, like every other.
-- ============================================================

-- ------------------------------------------------------------
-- 1. rule evaluation runs (auditability & versioning)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_model_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  rule_id text NOT NULL,
  rule_version text NOT NULL,
  config jsonb NOT NULL,
  config_hash text NOT NULL,
  window_from timestamptz NOT NULL,
  window_to timestamptz NOT NULL,
  alerts_created int NOT NULL DEFAULT 0 CHECK (alerts_created >= 0),
  alerts_suppressed int NOT NULL DEFAULT 0 CHECK (alerts_suppressed >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  error text,
  triggered_by uuid REFERENCES app_user(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_run_tenant_created
  ON ai_model_run (tenant_id, created_at DESC);

-- ------------------------------------------------------------
-- 2. alerts — the investigation queue (never auto-acts)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  run_id uuid REFERENCES ai_model_run(id),
  rule_id text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  dedupe_key text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('product','warehouse','invoice','invoice_reversal','shift','stock_adjustment','cashier')),
  entity_id uuid,
  entity_label text NOT NULL,
  title text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES app_user(id),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES app_user(id),
  resolution_note text
);

CREATE INDEX IF NOT EXISTS idx_ai_alert_queue
  ON ai_alert (tenant_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_alert_rule
  ON ai_alert (tenant_id, rule_id, created_at DESC);

-- Re-scan dedupe: at most ONE open-or-acknowledged alert per
-- (tenant, rule, entity). A resolved/dismissed alert does NOT
-- block a fresh one — if the condition still holds after a
-- human closed it, the queue deserves to know again.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_alert_open_dedupe
  ON ai_alert (tenant_id, dedupe_key)
  WHERE status IN ('open','acknowledged');

-- ------------------------------------------------------------
-- 3. human feedback loop
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  alert_id uuid NOT NULL REFERENCES ai_alert(id) ON DELETE CASCADE,
  useful boolean NOT NULL,
  reason text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, alert_id, created_by)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_alert
  ON ai_feedback (tenant_id, alert_id);

-- ------------------------------------------------------------
-- 4. RLS + grants
-- ------------------------------------------------------------
ALTER TABLE ai_model_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ai_model_run;
CREATE POLICY tenant_isolation ON ai_model_run
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON ai_alert;
CREATE POLICY tenant_isolation ON ai_alert
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON ai_feedback;
CREATE POLICY tenant_isolation ON ai_feedback
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON ai_model_run TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON ai_alert TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON ai_feedback TO idepot_app;
