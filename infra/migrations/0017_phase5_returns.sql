-- ============================================================
-- 0017_phase5_returns.sql — Phase 5 returns foundation: configurable
-- return reasons with policy flags, the append-only return-order
-- document (header + lines) with its tested state machine, and the
-- returnable-quantity conservation guard.
--
-- ADDITIVE ONLY: 0001–0016 are already applied and immutable.
--
-- Design (legacy-audit/returns-refund-credit.md §4 + Phase 5 master
-- prompt §4): the legacy live refund routine was a DESTRUCTIVE in-place
-- order amendment (broken against its own schema) and the legacy returns
-- DDL never ran. The corrected model is a first-class return_order
-- document that NEVER edits the original invoice: every financial
-- effect is a new append-only correction document posted in the same
-- UnitOfWork transaction (credit note → refund / store credit).
--
-- State machine: draft → submitted → approved → received → processed
-- → completed, with rejected/cancelled terminal side-paths. Lines are
-- append-only; the header is mutable ONLY for lifecycle evidence
-- (status, approval/reception/processing stamps).
--
-- Quantity protection (invariant 1): for every invoice line,
--   Σ return_order_line.quantity_base over return orders in reserving
--   statuses ≤ invoice_line.quantity_base
-- enforced by a DEFERRED constraint trigger (DB backstop) on top of the
-- service-level advisory-lock serialization.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Document sequence catalog: the five Phase 5 document types
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
    'SUPPLIER_ADJUSTMENT','BANK_TRANSFER',
    'RETURN_ORDER','CREDIT_NOTE','REFUND','STORE_CREDIT','EXCHANGE'
  ));

-- ------------------------------------------------------------
-- 2. GL purpose catalog: the Phase 5 customer-entitlement liabilities
--    + breakage income (mapped accounts are provisioned idempotently
--    per tenant by FinancialConfigurationService.ensureDefaults)
-- ------------------------------------------------------------
DO $$
DECLARE
  con text;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'gl_mapping'::regclass AND contype = 'c'
      AND conname = 'gl_mapping_purpose_check'
  LOOP
    EXECUTE format('ALTER TABLE gl_mapping DROP CONSTRAINT %I', con);
  END LOOP;
END $$;

ALTER TABLE gl_mapping
  ADD CONSTRAINT gl_mapping_purpose_check
  CHECK (purpose IN (
    'sales_revenue','inventory','cogs','accounts_receivable','cash',
    'bank_clearing','momo_clearing','cheque_clearing',
    'customer_deposit_liability','tax_payable',
    'accounts_payable','grni_clearing','supplier_advance',
    'input_tax_recoverable','purchase_expense','purchase_price_variance',
    'inventory_adjustment_gain','inventory_adjustment_loss',
    'opening_balance_equity','retained_earnings','bank_fee_expense',
    'inventory_in_transit',
    'refunds_payable','store_credit_liability','refund_breakage_income'
  ));

-- ------------------------------------------------------------
-- 3. Return reasons — configurable policy, effective per tenant
-- ------------------------------------------------------------
-- composite-FK target for invoice lines (first composite reference to
-- this table — Phase 3/4 never needed one)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_line_tenant_id
  ON invoice_line (tenant_id, id);

CREATE TABLE IF NOT EXISTS return_reason (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  refund_permitted boolean NOT NULL DEFAULT true,
  replacement_permitted boolean NOT NULL DEFAULT true,
  store_credit_permitted boolean NOT NULL DEFAULT true,
  restock_permitted boolean NOT NULL DEFAULT true,
  inspection_required boolean NOT NULL DEFAULT false,
  evidence_required boolean NOT NULL DEFAULT false,
  -- days after the sale within which a return is still accepted
  -- (NULL = no deadline)
  refund_deadline_days int CHECK (refund_deadline_days IS NULL OR refund_deadline_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_return_reason_active
  ON return_reason (tenant_id, is_active, sort_order);

-- composite-FK target for reason references from the return tables
CREATE UNIQUE INDEX IF NOT EXISTS uq_return_reason_tenant_id
  ON return_reason (tenant_id, id);

-- ------------------------------------------------------------
-- 4. The return-order document (header)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS return_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  -- the ORIGINAL POSTED invoice this return corrects (never edited)
  invoice_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  -- receiving warehouse (where the goods land / are inspected)
  warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','received','processed','completed','rejected','cancelled')),
  -- primary reason (line-level overrides live on the lines)
  reason_id uuid,
  credit_disposition text NOT NULL DEFAULT 'refund'
    CHECK (credit_disposition IN ('refund','store_credit')),
  -- no-stock price credit (authorized adjustment returns): must be 0
  -- whenever lines exist — a price correction has no physical legs
  adjustment_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (adjustment_amount >= 0),
  customer_note text,
  internal_note text,
  -- financial decomposition, written ONCE at processing:
  gross_credit numeric(18,4) CHECK (gross_credit IS NULL OR gross_credit >= 0),
  ar_amount numeric(18,4) CHECK (ar_amount IS NULL OR ar_amount >= 0),
  refund_amount numeric(18,4) CHECK (refund_amount IS NULL OR refund_amount >= 0),
  store_credit_amount numeric(18,4) CHECK (store_credit_amount IS NULL OR store_credit_amount >= 0),
  cogs_reversal numeric(18,4) CHECK (cogs_reversal IS NULL OR cogs_reversal >= 0),
  credit_note_id uuid,
  -- approval / rejection evidence (immutable once written)
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  auto_approved boolean,
  rejected_by uuid REFERENCES app_user(id),
  rejected_at timestamptz,
  rejection_reason text,
  -- reception / inspection evidence
  received_by uuid REFERENCES app_user(id),
  received_at timestamptz,
  inspection_note text,
  -- processing evidence
  processed_by uuid REFERENCES app_user(id),
  processed_at timestamptz,
  completed_at timestamptz,
  -- idempotent retry identity (same contract as supplier advance
  -- applications: same key + same normalized payload ⇒ replay, same
  -- key + different payload ⇒ 409 idempotency_key_reuse)
  client_doc_id text,
  request_fingerprint text,
  business_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id),
  CONSTRAINT fk_ro_invoice_tenant FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES invoice (tenant_id, id),
  CONSTRAINT fk_ro_customer_tenant FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customer (tenant_id, id),
  CONSTRAINT fk_ro_warehouse_tenant FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES warehouse (tenant_id, id),
  CONSTRAINT fk_ro_reason_tenant FOREIGN KEY (tenant_id, reason_id)
    REFERENCES return_reason (tenant_id, id)
  -- NOTE: fk_ro_credit_note_tenant is added by 0018 once the credit-note
  -- table exists (the header's credit_note_id is NULL until processing)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_return_order_tenant_id
  ON return_order (tenant_id, id);

-- ------------------------------------------------------------
-- 5. Return-order lines (append-only financial evidence)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS return_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  return_order_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  product_id uuid NOT NULL,
  unit_id uuid,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  condition text NOT NULL
    CHECK (condition IN ('new_unopened','like_new','good','fair','damaged','defective','unsellable','quarantine_pending')),
  disposition text NOT NULL
    CHECK (disposition IN ('restock_sellable','restock_damaged','quarantine','scrap','reject','no_restock')),
  -- where the returned goods land (defaults to the header warehouse)
  restock_warehouse_id uuid,
  reason_id uuid,
  -- server-copied ORIGINAL invoice evidence (immutable snapshot):
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),
  line_net numeric(18,4) NOT NULL CHECK (line_net >= 0),
  order_discount_share numeric(18,4) NOT NULL DEFAULT 0 CHECK (order_discount_share >= 0),
  effective_net numeric(18,4) NOT NULL CHECK (effective_net >= 0),
  cost_at_sale numeric(18,4) CHECK (cost_at_sale IS NULL OR cost_at_sale >= 0),
  cogs_at_sale numeric(18,4) CHECK (cogs_at_sale IS NULL OR cogs_at_sale >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_order_id, invoice_line_id),
  CONSTRAINT fk_rol_return_tenant FOREIGN KEY (tenant_id, return_order_id)
    REFERENCES return_order (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_rol_invoice_line_tenant FOREIGN KEY (tenant_id, invoice_line_id)
    REFERENCES invoice_line (tenant_id, id),
  CONSTRAINT fk_rol_product_tenant FOREIGN KEY (tenant_id, product_id)
    REFERENCES product (tenant_id, id),
  CONSTRAINT fk_rol_unit_tenant FOREIGN KEY (tenant_id, unit_id)
    REFERENCES unit (tenant_id, id),
  CONSTRAINT fk_rol_restock_warehouse_tenant FOREIGN KEY (tenant_id, restock_warehouse_id)
    REFERENCES warehouse (tenant_id, id),
  CONSTRAINT fk_rol_reason_tenant FOREIGN KEY (tenant_id, reason_id)
    REFERENCES return_reason (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_return_order_line_tenant_id
  ON return_order_line (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_rol_return_order
  ON return_order_line (tenant_id, return_order_id);
CREATE INDEX IF NOT EXISTS idx_rol_invoice_line
  ON return_order_line (tenant_id, invoice_line_id);

CREATE INDEX IF NOT EXISTS idx_return_order_invoice
  ON return_order (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_return_order_customer
  ON return_order (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_return_order_status
  ON return_order (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_return_order_business_date
  ON return_order (tenant_id, business_date);
-- approval queue workload
CREATE INDEX IF NOT EXISTS idx_return_order_pending_approval
  ON return_order (tenant_id, created_at) WHERE status = 'submitted';

-- ------------------------------------------------------------
-- 6. Returnable-quantity conservation guard (invariant 1)
--    For every invoice line: Σ quantities of return lines attached to
--    RESERVING return orders ≤ the originally sold quantity. Drafts
--    reserve nothing; cancelled/rejected release their claim.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_return_quantity_guard() RETURNS trigger AS $$
DECLARE
  v_invoice uuid;
  v_tenant uuid;
  r record;
BEGIN
  IF TG_TABLE_NAME = 'return_order' THEN
    -- a status transition re-evaluates every line of THIS order's invoice
    v_invoice := NEW.invoice_id;
    v_tenant := NEW.tenant_id;
  ELSE
    SELECT ro.invoice_id, ro.tenant_id INTO v_invoice, v_tenant
      FROM return_order ro WHERE ro.id = NEW.return_order_id;
  END IF;

  IF v_invoice IS NULL THEN
    RETURN NULL; -- orphaned line cannot happen (FK), vacuously conserved
  END IF;

  FOR r IN
    SELECT il.id AS line_id, il.quantity_base AS limit_qty,
      COALESCE((SELECT SUM(rol.quantity_base) FROM return_order_line rol
        JOIN return_order ro ON ro.id = rol.return_order_id
        WHERE rol.invoice_line_id = il.id
          AND ro.status IN ('submitted','approved','received','processed','completed')), 0) AS reserved
    FROM invoice_line il
    WHERE il.invoice_id = v_invoice AND il.tenant_id = v_tenant
  LOOP
    IF r.reserved > r.limit_qty THEN
      RAISE EXCEPTION
        'return quantity for invoice line % exceeds the sold quantity (sold %, reserved %) — over-return is rejected at commit',
        r.line_id, r.limit_qty, r.reserved
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE CONSTRAINT TRIGGER return_order_quantity_guard
  AFTER INSERT OR UPDATE OF status ON return_order
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_return_quantity_guard();

CREATE CONSTRAINT TRIGGER return_order_line_quantity_guard
  AFTER INSERT OR UPDATE ON return_order_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_return_quantity_guard();

-- ------------------------------------------------------------
-- 7. Tenant-level refund approval threshold (Phase 5 §4.5): returns
--    whose gross credit exceeds this amount ALWAYS need an approver
--    with returns:approve — below it, reasons flagged
--    requires_approval=false may auto-approve with evidence.
-- ------------------------------------------------------------
ALTER TABLE tenant_config
  ADD COLUMN IF NOT EXISTS refund_approval_threshold numeric(18,4) NOT NULL DEFAULT 0
  CHECK (refund_approval_threshold >= 0);

-- ------------------------------------------------------------
-- 8. RLS + grants
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['return_reason','return_order','return_order_line']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

-- reasons are mutable configuration (no DELETE — deactivate instead)
GRANT SELECT, INSERT, UPDATE ON return_reason TO idepot_app;
-- the return order header carries lifecycle evidence (status + stamps)
GRANT SELECT, INSERT, UPDATE ON return_order TO idepot_app;
-- lines are append-only financial evidence
GRANT SELECT, INSERT ON return_order_line TO idepot_app;
