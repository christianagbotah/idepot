-- ============================================================
-- 0023_phase7a_settings_trigger_fix.sql — repair the Phase 5
-- overlap-guard BEFORE-triggers that silently discarded writes.
--
-- DEFECT (found by the Phase 7a intelligence integration suite on
-- 2026-11-14): trg_kpi_target_overlap_guard and
-- trg_tenant_setting_overlap_guard are BEFORE INSERT OR UPDATE row
-- triggers whose success path ended in `RETURN NULL`. In PostgreSQL a
-- BEFORE trigger returning NULL SKIPS the operation silently — every
-- kpi_target and tenant_setting INSERT/UPDATE since 0019 was a no-op:
-- the settings upsert API returned 500 (its post-insert SELECT found
-- nothing) and KPI target creation silently did nothing. No prior test
-- exercised either write path, so the defect shipped invisible. The
-- loyalty guards are CONSTRAINT (AFTER) triggers where the return
-- value is ignored — unaffected.
--
-- FIX: CREATE OR REPLACE both functions with the identical guard logic
-- but `RETURN NEW` on the success path. Idempotent, no data change:
-- there are no rows to repair because none were ever written.
-- ============================================================

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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
