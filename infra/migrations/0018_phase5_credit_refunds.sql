-- ============================================================
-- 0018_phase5_credit_refunds.sql — Phase 5 financial instruments:
-- the credit-note document (with per-component tax-reversal evidence),
-- the refund engine, store credits + redemptions, and exchanges,
-- each with a deferred entitlement-conservation guard.
--
-- ADDITIVE ONLY: 0001–0017 are already applied and immutable.
--
-- Financial model (posting-rules.md §Phase 5):
--  credit note = separate POSTED document, the single journal source
--  for a return's financial effect:
--    Dr sales_revenue      net revenue reversal
--    Dr tax_payable        per component, TRANSACTION-TIME evidence,
--                          capped at the originally posted amount
--    Cr accounts_receivable        settlement of outstanding AR FIRST
--    Cr refunds_payable            residual (disposition = refund)
--    Cr store_credit_liability     residual (disposition = store credit)
--    Dr inventory / Cr cogs        restocked value at ORIGINAL cost
--  refund = money actually leaving (Dr refunds_payable / Cr tender),
--  store_credit = explicit liability instrument redeemed against
--  invoices, exchange = return + replacement sale settled atomically.
--
-- Invariants enforced here (Phase 5 §18):
--   2. Σ refunds + Σ exchange consumptions ≤ credit_note.refund_amount
--   4. one credit note per return order (UNIQUE)
--   5. Σ store-credit redemptions ≤ store_credit.amount
--   6. a refund and a store credit never double-settle one entitlement
--      (refund_amount and store_credit_amount are disjoint residuals)
--   7. Σ tax reversals per (invoice, component) ≤ original tax posted
-- ============================================================

-- ------------------------------------------------------------
-- 1. Credit notes — append-only posted financial documents
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  -- ONE credit note per return order (a return is financially
  -- processed at most once — invariant 3)
  return_order_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  business_date date NOT NULL,
  -- gross customer entitlement = net revenue + reversible tax
  total numeric(18,4) NOT NULL CHECK (total > 0),
  -- the TAX-PRORATION AXIS slice (Σ effective-net slices of returned
  -- lines + adjustment): cumulative Σ credited_net over all credit
  -- notes of an invoice is the axis the per-component tax reversal
  -- prorates on (see trg_return credit math in the service)
  credited_net numeric(18,4) NOT NULL CHECK (credited_net >= 0),
  net_revenue_reversal numeric(18,4) NOT NULL CHECK (net_revenue_reversal >= 0),
  tax_reversal_total numeric(18,4) NOT NULL DEFAULT 0 CHECK (tax_reversal_total >= 0),
  -- settlement decomposition (sums to total by CHECK)
  ar_amount numeric(18,4) NOT NULL CHECK (ar_amount >= 0),
  refund_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  store_credit_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (store_credit_amount >= 0),
  -- original-cost evidence restored to inventory (restocked lines only)
  cogs_reversal numeric(18,4) NOT NULL DEFAULT 0 CHECK (cogs_reversal >= 0),
  journal_entry_id uuid,
  note text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, return_order_id),
  CONSTRAINT fk_cn_return_tenant FOREIGN KEY (tenant_id, return_order_id)
    REFERENCES return_order (tenant_id, id),
  CONSTRAINT fk_cn_invoice_tenant FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES invoice (tenant_id, id),
  CONSTRAINT fk_cn_customer_tenant FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customer (tenant_id, id),
  CONSTRAINT fk_cn_journal_tenant FOREIGN KEY (tenant_id, journal_entry_id)
    REFERENCES journal_entry (tenant_id, id),
  -- header conservation (the second wall; the service computes the
  -- decomposition first with exact scaled-BigInt math)
  CONSTRAINT credit_note_identity CHECK (
    total = net_revenue_reversal + tax_reversal_total
    AND total = ar_amount + refund_amount + store_credit_amount
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_note_tenant_id
  ON credit_note (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_credit_note_invoice
  ON credit_note (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_customer
  ON credit_note (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_business_date
  ON credit_note (tenant_id, business_date);

-- deferred linkage from the return order to its (single) credit note
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ro_credit_note_tenant'
      AND conrelid = 'return_order'::regclass
  ) THEN
    ALTER TABLE return_order ADD CONSTRAINT fk_ro_credit_note_tenant
      FOREIGN KEY (tenant_id, credit_note_id) REFERENCES credit_note (tenant_id, id);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Credit-note tax evidence — per component, TRANSACTION-TIME
--    (snapshot of the invoice's own invoice_tax_component rows)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_note_tax_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  credit_note_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  component_name text NOT NULL,
  rate numeric(9,6) NOT NULL CHECK (rate >= 0 AND rate < 1),
  inclusive boolean NOT NULL,
  -- the credited net this component's reversal is prorated on
  taxable_basis numeric(18,4) NOT NULL CHECK (taxable_basis >= 0),
  tax_amount numeric(18,4) NOT NULL CHECK (tax_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credit_note_id, component_name),
  CONSTRAINT fk_cntc_credit_note_tenant FOREIGN KEY (tenant_id, credit_note_id)
    REFERENCES credit_note (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_cntc_invoice_tenant FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES invoice (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_note_tax_component_tenant_id
  ON credit_note_tax_component (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_cntc_credit_note
  ON credit_note_tax_component (tenant_id, credit_note_id);
CREATE INDEX IF NOT EXISTS idx_cntc_invoice
  ON credit_note_tax_component (tenant_id, invoice_id);

-- ------------------------------------------------------------
-- 3. Refunds — the money-out engine
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refund (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  credit_note_id uuid NOT NULL,
  return_order_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  -- money-out method; refund-to-original-tender is the preferred policy,
  -- a different destination requires controlled approval + audit
  method text NOT NULL CHECK (method IN ('cash','momo','cheque','bank_transfer')),
  bank_account_id uuid,
  momo_provider text CHECK (momo_provider IS NULL OR momo_provider IN ('MTN','Vodafone','AirtelTigo')),
  momo_phone text,
  reference text,
  note text,
  -- requested → approved → posted → externally settled; a requested or
  -- approved refund can be cancelled; a failed external settlement is
  -- recorded and safely retryable (never silently marked settled)
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','posted','settled','cancelled','failed')),
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  posted_by uuid REFERENCES app_user(id),
  posted_at timestamptz,
  journal_entry_id uuid,
  settled_at timestamptz,
  settled_by uuid REFERENCES app_user(id),
  settlement_reference text,
  client_doc_id text,
  request_fingerprint text,
  business_date date NOT NULL,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id),
  CONSTRAINT fk_refund_credit_note_tenant FOREIGN KEY (tenant_id, credit_note_id)
    REFERENCES credit_note (tenant_id, id),
  CONSTRAINT fk_refund_return_tenant FOREIGN KEY (tenant_id, return_order_id)
    REFERENCES return_order (tenant_id, id),
  CONSTRAINT fk_refund_customer_tenant FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customer (tenant_id, id),
  CONSTRAINT fk_refund_bank_account_tenant FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES bank_account (tenant_id, id),
  CONSTRAINT fk_refund_journal_tenant FOREIGN KEY (tenant_id, journal_entry_id)
    REFERENCES journal_entry (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_tenant_id
  ON refund (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_refund_credit_note
  ON refund (tenant_id, credit_note_id);
CREATE INDEX IF NOT EXISTS idx_refund_customer
  ON refund (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_status
  ON refund (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_refund_business_date
  ON refund (tenant_id, business_date);

-- ------------------------------------------------------------
-- 4. Store credits — explicit liability instrument, distinct from
--    customer deposits (which remain the pre-payment substrate)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_credit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  credit_note_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  business_date date NOT NULL,
  -- expiry only under authorized accounting policy (never silently)
  expiry_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','redeemed','expired','void')),
  expired_at timestamptz,
  expired_by uuid REFERENCES app_user(id),
  note text,
  client_doc_id text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id),
  CONSTRAINT fk_sc_credit_note_tenant FOREIGN KEY (tenant_id, credit_note_id)
    REFERENCES credit_note (tenant_id, id),
  CONSTRAINT fk_sc_customer_tenant FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customer (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_credit_tenant_id
  ON store_credit (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_store_credit_customer
  ON store_credit (tenant_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_store_credit_credit_note
  ON store_credit (tenant_id, credit_note_id);

CREATE TABLE IF NOT EXISTS store_credit_redemption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  store_credit_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  journal_entry_id uuid,
  business_date date NOT NULL,
  client_doc_id text,
  request_fingerprint text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_credit_id, invoice_id),
  UNIQUE (tenant_id, client_doc_id),
  CONSTRAINT fk_scr_store_credit_tenant FOREIGN KEY (tenant_id, store_credit_id)
    REFERENCES store_credit (tenant_id, id),
  CONSTRAINT fk_scr_invoice_tenant FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES invoice (tenant_id, id),
  CONSTRAINT fk_scr_journal_tenant FOREIGN KEY (tenant_id, journal_entry_id)
    REFERENCES journal_entry (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_credit_redemption_tenant_id
  ON store_credit_redemption (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_scr_store_credit
  ON store_credit_redemption (tenant_id, store_credit_id);
CREATE INDEX IF NOT EXISTS idx_scr_invoice
  ON store_credit_redemption (tenant_id, invoice_id);

-- ------------------------------------------------------------
-- 5. Exchanges — linked return + replacement sale settled atomically
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  return_order_id uuid NOT NULL,
  replacement_invoice_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  return_credit numeric(18,4) NOT NULL CHECK (return_credit >= 0),
  replacement_total numeric(18,4) NOT NULL CHECK (replacement_total >= 0),
  -- signed: replacement_total − return_credit
  price_difference numeric(18,4) NOT NULL,
  settlement text NOT NULL
    CHECK (settlement IN ('additional_payment','residual_credit','even')),
  -- refunds-payable entitlement consumed against the replacement sale
  consumed_refund_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (consumed_refund_amount >= 0),
  journal_entry_id uuid,
  business_date date NOT NULL,
  client_doc_id text,
  request_fingerprint text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id),
  UNIQUE (tenant_id, return_order_id),
  CONSTRAINT fk_exc_return_tenant FOREIGN KEY (tenant_id, return_order_id)
    REFERENCES return_order (tenant_id, id),
  CONSTRAINT fk_exc_replacement_invoice_tenant FOREIGN KEY (tenant_id, replacement_invoice_id)
    REFERENCES invoice (tenant_id, id),
  CONSTRAINT fk_exc_customer_tenant FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customer (tenant_id, id),
  CONSTRAINT fk_exc_journal_tenant FOREIGN KEY (tenant_id, journal_entry_id)
    REFERENCES journal_entry (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_tenant_id
  ON exchange (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_exc_customer
  ON exchange (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_exc_replacement_invoice
  ON exchange (tenant_id, replacement_invoice_id);

-- ------------------------------------------------------------
-- 6. Entitlement guards (deferred, at COMMIT)
-- ------------------------------------------------------------

-- 6a. Refund over-entitlement (invariant 2): committed refunds +
--     exchange consumptions may never exceed the credit note's
--     refund_amount residual.
CREATE OR REPLACE FUNCTION trg_refund_entitlement_guard() RETURNS trigger AS $$
DECLARE
  v_note uuid;
  v_tenant uuid;
  v_limit numeric(18,4);
  v_consumed numeric(18,4);
BEGIN
  IF TG_TABLE_NAME = 'refund' THEN
    v_note := CASE WHEN TG_OP = 'DELETE' THEN OLD.credit_note_id ELSE NEW.credit_note_id END;
  ELSE
    v_note := NEW.credit_note_id;
  END IF;
  SELECT refund_amount, tenant_id INTO v_limit, v_tenant FROM credit_note WHERE id = v_note;
  IF v_limit IS NULL THEN
    RETURN NULL; -- credit note removed, rows cascaded: vacuous
  END IF;
  -- VOIDED store credits convert their liability back into refundable
  -- entitlement (the void posts Dr store_credit_liability / Cr
  -- refunds_payable), so they widen the available pool symmetrically
  -- with the service-side outstanding calculation
  v_limit := v_limit + COALESCE((SELECT SUM(sc.amount) FROM store_credit sc
    WHERE sc.credit_note_id = v_note AND sc.status = 'void'), 0);
  SELECT
    COALESCE((SELECT SUM(amount) FROM refund
      WHERE credit_note_id = v_note
        AND status IN ('approved','posted','settled')), 0)
    + COALESCE((SELECT SUM(consumed_refund_amount) FROM exchange
      WHERE return_order_id IN (SELECT id FROM return_order WHERE credit_note_id = v_note)), 0)
    INTO v_consumed;
  IF v_consumed > v_limit THEN
    RAISE EXCEPTION
      'refunds + exchange consumptions exceed the credit note refund entitlement (% > %)',
      v_consumed, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER refund_entitlement_guard
  AFTER INSERT OR UPDATE OF amount, status, credit_note_id ON refund
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_refund_entitlement_guard();

CREATE CONSTRAINT TRIGGER exchange_refund_entitlement_guard
  AFTER INSERT OR UPDATE OF consumed_refund_amount ON exchange
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_refund_entitlement_guard();

-- 6b. Store-credit issue cap (disjoint from refunds by construction):
--     Σ issued store credits ≤ credit_note.store_credit_amount.
CREATE OR REPLACE FUNCTION trg_store_credit_issue_guard() RETURNS trigger AS $$
DECLARE
  v_limit numeric(18,4);
  v_issued numeric(18,4);
BEGIN
  SELECT store_credit_amount INTO v_limit FROM credit_note WHERE id = NEW.credit_note_id;
  IF v_limit IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_issued FROM store_credit
    WHERE credit_note_id = NEW.credit_note_id AND status IN ('active','redeemed','expired');
  IF v_issued > v_limit THEN
    RAISE EXCEPTION
      'issued store credit exceeds the credit note store-credit entitlement (% > %)',
      v_issued, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER store_credit_issue_guard
  AFTER INSERT OR UPDATE OF amount ON store_credit
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_store_credit_issue_guard();

-- 6c. Store-credit redemption cap (invariant 5): redemptions consume a
--     materialized instrument; the remaining balance is derived, never
--     mutated (append-only ledger, same shape as customer deposits).
CREATE OR REPLACE FUNCTION trg_store_credit_redemption_guard() RETURNS trigger AS $$
DECLARE
  v_credit uuid;
  v_amount numeric(18,4);
  v_consumed numeric(18,4);
BEGIN
  v_credit := CASE WHEN TG_OP = 'DELETE' THEN OLD.store_credit_id ELSE NEW.store_credit_id END;
  SELECT amount INTO v_amount FROM store_credit WHERE id = v_credit;
  IF v_amount IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_consumed FROM store_credit_redemption
    WHERE store_credit_id = v_credit;
  IF v_consumed > v_amount THEN
    RAISE EXCEPTION
      'store credit redemptions exceed the issued amount (% > %)',
      v_consumed, v_amount
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER store_credit_redemption_guard
  AFTER INSERT OR UPDATE ON store_credit_redemption
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_store_credit_redemption_guard();

-- 6d. Tax-reversal cap (invariant 7): per (invoice, component name),
--     Σ credit-note reversals may never exceed the tax amount
--     originally POSTED on that invoice (transaction-time evidence).
CREATE OR REPLACE FUNCTION trg_tax_reversal_cap_guard() RETURNS trigger AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT itc.invoice_id, itc.component_name, itc.tax_amount AS original,
      COALESCE((SELECT SUM(cntc.tax_amount) FROM credit_note_tax_component cntc
        WHERE cntc.invoice_id = itc.invoice_id
          AND cntc.component_name = itc.component_name), 0) AS reversed
    FROM invoice_tax_component itc
    WHERE itc.invoice_id = NEW.invoice_id AND itc.tenant_id = NEW.tenant_id
  LOOP
    IF r.reversed > r.original THEN
      RAISE EXCEPTION
        'tax reversal for invoice % component % exceeds the originally posted tax (% > %)',
        r.invoice_id, r.component_name, r.reversed, r.original
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER tax_reversal_cap_guard
  AFTER INSERT OR UPDATE OF tax_amount ON credit_note_tax_component
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_tax_reversal_cap_guard();

-- ------------------------------------------------------------
-- 7. RLS + grants
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_note','credit_note_tax_component','refund',
    'store_credit','store_credit_redemption','exchange']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

-- posted financial evidence is append-only
GRANT SELECT, INSERT ON credit_note TO idepot_app;
GRANT SELECT, INSERT ON credit_note_tax_component TO idepot_app;
GRANT SELECT, INSERT ON store_credit_redemption TO idepot_app;
GRANT SELECT, INSERT ON exchange TO idepot_app;
-- the refund + store-credit headers carry lifecycle status evidence
GRANT SELECT, INSERT, UPDATE ON refund TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON store_credit TO idepot_app;
