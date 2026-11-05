-- ============================================================
-- 0015_supplier_advance_application.sql — third independent review
-- round (supplier advance lifecycle + reversal-aware AR, head 54f1555).
--
-- ADDITIVE ONLY: 0001–0014 are already applied and immutable.
--
-- 1. SUPPLIER ADVANCE APPLICATION (blocker 1): a supplier advance is
--    frequently paid BEFORE the associated goods and invoice exist
--    (Oct 1: pay ₵100 advance → Oct 20: invoice ₵60 → Oct 21/25:
--    apply ₵40 then ₵20). The previous design stored applications as
--    supplier_payment_allocation rows, which
--      a) UNIQUE (payment_id, supplier_invoice_id) forbids a SECOND
--         application of the same advance to the same invoice,
--      b) had no application business date (applications booked on the
--         advance's date, so an application could predate the invoice
--         it settles and every as-of window was distorted),
--      c) posted the journal as (supplier_payment, paymentId,
--         advance_applied) — the journal unique constraint
--         (tenant_id, source_kind, source_id, event) rejects the
--         SECOND application of the same advance.
--    The new append-only supplier_advance_application document is the
--    authoritative journal source: independent ID + code (SAA…),
--    advance/payment reference, application business date, client
--    idempotency identity, journal linkage, created-by/approved-by
--    evidence, audit + outbox written by the service in ONE UnitOfWork
--    transaction; its supplier_advance_application_line rows carry the
--    per-invoice allocation legs.
--
-- 2. CONSERVATION GUARD: Σ payment-time allocations (spa) + Σ advance
--    application legs (saal) ≤ payment amount — replaces the spa-only
--    guard, which the new document would otherwise bypass.
--
-- 3. NO data backfill is needed: every existing supplier_payment_
--    allocation row is part of its payment document (the payment
--    journal already moved AP on the payment's own date) and remains
--    exactly where it is; only LATER applications become saa documents.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Document sequence catalog: SUPPLIER_ADVANCE_APPLICATION
-- ------------------------------------------------------------
DO $$
DECLARE
  con text;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'document_sequence'::regclass AND contype = 'c'
      AND conname = 'document_sequence_doc_type_check'
  LOOP
    EXECUTE format('ALTER TABLE document_sequence DROP CONSTRAINT %I', con);
  END LOOP;
END $$;

ALTER TABLE document_sequence
  ADD CONSTRAINT document_sequence_doc_type_check
  CHECK (doc_type IN (
    'QUOTATION','SALE_ORDER','INVOICE','RECEIPT','WAYBILL','DEPOSIT',
    'INVOICE_REVERSAL',
    'PURCHASE_ORDER','GRN','SUPPLIER_INVOICE','SUPPLIER_PAYMENT',
    'SUPPLIER_ADVANCE_APPLICATION',
    'SUPPLIER_ADJUSTMENT','BANK_TRANSFER'
  ));

-- ------------------------------------------------------------
-- 2. The append-only application document (header + allocation legs)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_advance_application (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  -- the advance / unapplied supplier payment being applied
  payment_id uuid NOT NULL,
  -- total applied by this document = Σ lines (carried for guard + reads)
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  -- the application's OWN effective date: the journal books on this
  -- date — never on the original advance's business date
  business_date date NOT NULL,
  -- idempotent retry identity of the application command
  client_doc_id text,
  notes text,
  -- journal linkage (journal_entry.source = this document)
  journal_entry_id uuid,
  -- created-by / approval evidence (dual-signature workflow later)
  created_by uuid NOT NULL REFERENCES app_user(id),
  approved_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id),
  -- tenant-scoped reference integrity: a tenant-A row can never
  -- reference tenant-B financial documents (FK checks bypass RLS)
  CONSTRAINT fk_saa_payment_tenant FOREIGN KEY (tenant_id, payment_id)
    REFERENCES supplier_payment (tenant_id, id),
  CONSTRAINT fk_saa_journal_tenant FOREIGN KEY (tenant_id, journal_entry_id)
    REFERENCES journal_entry (tenant_id, id)
);

-- composite-FK target: created BEFORE the line table references it
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_advance_application_tenant_id
  ON supplier_advance_application (tenant_id, id);

CREATE TABLE IF NOT EXISTS supplier_advance_application_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  application_id uuid NOT NULL,
  supplier_invoice_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- one leg per invoice per application document
  UNIQUE (application_id, supplier_invoice_id),
  CONSTRAINT fk_saal_application_tenant FOREIGN KEY (tenant_id, application_id)
    REFERENCES supplier_advance_application (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_saal_invoice_tenant FOREIGN KEY (tenant_id, supplier_invoice_id)
    REFERENCES supplier_invoice (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_advance_application_line_tenant_id
  ON supplier_advance_application_line (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_saa_payment
  ON supplier_advance_application (tenant_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_saa_business_date
  ON supplier_advance_application (tenant_id, business_date);
CREATE INDEX IF NOT EXISTS idx_saal_application
  ON supplier_advance_application_line (tenant_id, application_id);
CREATE INDEX IF NOT EXISTS idx_saal_invoice
  ON supplier_advance_application_line (tenant_id, supplier_invoice_id);

-- ------------------------------------------------------------
-- 3. Conservation guard: payment-time allocations + application legs
--    together may never exceed the payment amount
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_supplier_advance_conservation() RETURNS trigger AS $$
DECLARE
  v_payment uuid;
  v_amount numeric(18,4);
  v_total numeric(18,4);
BEGIN
  v_payment := CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_id ELSE NEW.payment_id END;
  SELECT amount INTO v_amount FROM supplier_payment WHERE id = v_payment;
  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM (
    SELECT amount FROM supplier_payment_allocation WHERE payment_id = v_payment
    UNION ALL
    SELECT saal.amount FROM supplier_advance_application_line saal
      JOIN supplier_advance_application saa ON saa.id = saal.application_id
      WHERE saa.payment_id = v_payment
  ) s;
  IF v_total > v_amount THEN
    RAISE EXCEPTION 'supplier payment allocations + advance applications exceed the payment amount'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER supplier_advance_application_conservation
  AFTER INSERT OR UPDATE OR DELETE ON supplier_advance_application
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_supplier_advance_conservation();

-- the legacy spa-only guard is widened to consult BOTH evidence types, so
-- a payment-time allocation cannot silently exceed what applications left
CREATE OR REPLACE FUNCTION trg_supplier_payment_allocation_guard() RETURNS trigger AS $$
DECLARE
  v_payment uuid;
  v_total numeric(18,4);
  v_amount numeric(18,4);
BEGIN
  v_payment := CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_id ELSE NEW.payment_id END;
  SELECT amount INTO v_amount FROM supplier_payment WHERE id = v_payment;
  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM (
    SELECT amount FROM supplier_payment_allocation WHERE payment_id = v_payment
    UNION ALL
    SELECT saal.amount FROM supplier_advance_application_line saal
      JOIN supplier_advance_application saa ON saa.id = saal.application_id
      WHERE saa.payment_id = v_payment
  ) s;
  IF v_total > v_amount THEN
    RAISE EXCEPTION 'supplier payment allocations exceed the payment amount'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 4. RLS + grants (append-only: SELECT/INSERT; the journal linkage is
--    written by the same INSERT, never updated afterwards)
-- ------------------------------------------------------------
ALTER TABLE supplier_advance_application ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON supplier_advance_application;
CREATE POLICY tenant_isolation ON supplier_advance_application
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE supplier_advance_application_line ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON supplier_advance_application_line;
CREATE POLICY tenant_isolation ON supplier_advance_application_line
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON supplier_advance_application TO idepot_app;
GRANT SELECT, INSERT ON supplier_advance_application_line TO idepot_app;
