-- ============================================================
-- 0024_phase7a_duplicate_detection.sql — Phase 7a duplicate
-- detection (ai-opportunity-map.md §3 feature 15, tier 7a):
-- duplicate:customer / duplicate:supplier / duplicate:product
-- rules surface PAIR alerts whose entity is the newer of the two
-- records, so ai_alert.entity_type gains 'customer' and 'supplier'
-- ('product' is already allowed).
--
-- ADDITIVE ONLY: 0001–0023 are already applied and immutable; this
-- widens a CHECK domain (existing rows always satisfy the wider
-- constraint) and creates no new tables.
--
-- Guardrails unchanged (master prompt rule 14): the rules only
-- DETECT and alert — merging duplicate records stays a human
-- decision with its own permission and audit trail in a later
-- tier. No financial state is read-modified-written here.
-- ============================================================

-- widen the entity_type domain for pair alerts
ALTER TABLE ai_alert DROP CONSTRAINT IF EXISTS ai_alert_entity_type_check;
ALTER TABLE ai_alert ADD CONSTRAINT ai_alert_entity_type_check
  CHECK (entity_type IN ('product','warehouse','invoice','invoice_reversal','shift',
                         'stock_adjustment','cashier','customer','supplier'));
