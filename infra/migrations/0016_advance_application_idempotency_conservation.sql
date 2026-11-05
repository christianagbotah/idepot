-- ============================================================
-- 0016_advance_application_idempotency_conservation.sql — fourth
-- independent review round (idempotency trust boundary + deferred
-- conservation, head 3cfa761).
--
-- ADDITIVE ONLY: 0001–0015 are already applied and immutable.
--
-- 1. REQUEST FINGERPRINT (review blocker 1): the apply-advance command
--    is identified by its CANONICAL request fingerprint — tenant,
--    command type, payment id, application business date and the SORTED
--    allocation legs with normalized amounts (domain:
--    applyAdvanceRequestFingerprint). The fingerprint is persisted WITH
--    the application document and compared on every retry:
--      same key + same normalized payload  → replay of the original;
--      same key + DIFFERENT payload        → controlled HTTP 409
--                                            idempotency_key_reuse.
--    The column is NULLable: rows written before this migration (pre-
--    hardening) keep the legacy duplicate semantics — they replay
--    unchanged, exactly like the Phase 3 sync registry's compat rule.
--
-- 2. HEADER ↔ LINES CONSERVATION (review blocker 3): migration 0015's
--    guard only proves Σ(payment-time allocations + application legs) ≤
--    payment amount. The header's own `amount` was never checked against
--    Σ(its lines), so a forged or incomplete application header (amount
--    ≠ Σ legs, or a header with no legs at all) would post a journal for
--    one number while the AP subledger consumed another. This migration
--    adds a DEFERRABLE INITIALLY DEFERRED constraint trigger, checked at
--    COMMIT, on BOTH tables: header.amount must equal Σ line amounts
--    for every application document. Deferral respects the construction
--    order (header first, legs after — both visible at commit) while
--    still rejecting forged/incomplete documents atomically: the whole
--    transaction, journal included, rolls back.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Persisted canonical request identity
-- ------------------------------------------------------------
ALTER TABLE supplier_advance_application
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

COMMENT ON COLUMN supplier_advance_application.request_fingerprint IS
  'sha-256 of the canonical apply-advance request (tenant+command+payment+date+sorted normalized legs) — same key + different fingerprint is a controlled idempotency_key_reuse 409; NULL = pre-hardening row (legacy replay semantics)';

-- ------------------------------------------------------------
-- 2. Header ↔ lines conservation invariant (deferrable, at COMMIT)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_saa_header_lines_conservation() RETURNS trigger AS $$
DECLARE
  v_app uuid;
  v_header numeric(18,4);
  v_lines numeric(18,4);
BEGIN
  -- which application document changed depends on the firing table
  IF TG_TABLE_NAME = 'supplier_advance_application_line' THEN
    v_app := CASE WHEN TG_OP = 'DELETE' THEN OLD.application_id ELSE NEW.application_id END;
  ELSE
    v_app := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  END IF;

  SELECT amount INTO v_header FROM supplier_advance_application WHERE id = v_app;
  SELECT COALESCE(SUM(amount), 0) INTO v_lines FROM supplier_advance_application_line
    WHERE application_id = v_app;

  IF v_header IS NULL THEN
    IF v_lines = 0 THEN
      -- the document itself is being removed and its lines cascaded away:
      -- conservation is vacuous for a document that no longer exists
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'supplier advance application % has lines but no header', v_app
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_header <> v_lines THEN
    RAISE EXCEPTION
      'supplier advance application % conservation violated: header amount % <> Σ line amounts % — forged or incomplete application documents are rejected at commit',
      v_app, v_header, v_lines
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER saa_header_lines_conservation
  AFTER INSERT OR UPDATE OR DELETE ON supplier_advance_application
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_saa_header_lines_conservation();

CREATE CONSTRAINT TRIGGER saal_header_lines_conservation
  AFTER INSERT OR UPDATE OR DELETE ON supplier_advance_application_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_saa_header_lines_conservation();
