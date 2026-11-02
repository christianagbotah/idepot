-- ============================================================
-- 0010_phase4_purchasing_ap.sql — Phase 4 purchasing & AP.
--
-- ADDITIVE ONLY. Implements the corrected purchasing model
-- (legacy-audit/purchasing-lifecycle.md §4): the legacy collapse of
-- PO + GRN + supplier invoice into ONE "purchase order" row-per-line
-- event is replaced by four distinct documents:
--
--   purchase_order  (draft → approved → issued → partially_received
--                    → received → closed / cancelled)
--   goods_receipt   (GRN — stock-affecting, AVCO cost layer,
--                    Dr Inventory / Cr GR-IR)
--   supplier_invoice(AP-affecting, 3-way match, Dr GR-IR + tax +
--                    PPV / Cr AP)
--   supplier_payment(+ explicit allocations; Dr AP + Dr advances /
--                    Cr tender controls)
--   supplier_adjustment (append-only debit/credit notes; never a
--                    destructive edit of the source invoice)
--
-- Money numeric(18,4), quantities numeric(18,6), composite
-- tenant-aware FKs, RLS fail-closed, per-tenant uniqueness.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Purchasing tolerance policy (configurable, never magic)
-- ------------------------------------------------------------
ALTER TABLE tenant_config
  ADD COLUMN IF NOT EXISTS po_overreceipt_tolerance_pct numeric(9,6) NOT NULL DEFAULT 0
    CHECK (po_overreceipt_tolerance_pct >= 0),
  ADD COLUMN IF NOT EXISTS match_price_tolerance_pct numeric(9,6) NOT NULL DEFAULT 0
    CHECK (match_price_tolerance_pct >= 0),
  ADD COLUMN IF NOT EXISTS match_value_tolerance numeric(18,4) NOT NULL DEFAULT 0
    CHECK (match_value_tolerance >= 0);

-- supplier-side tax components may be recoverable input tax
ALTER TABLE tax_component
  ADD COLUMN IF NOT EXISTS recoverable boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 1. Purchase orders
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES supplier(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','issued',
                      'partially_received','received','closed','cancelled')),
  expected_date date,
  notes text,
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_order_tenant_id
  ON purchase_order (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_status
  ON purchase_order (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  purchase_order_id uuid NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  unit_id uuid REFERENCES unit(id),
  ordered_quantity numeric(18,6) NOT NULL CHECK (ordered_quantity > 0),
  conversion_factor numeric(18,6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  ordered_quantity_base numeric(18,6) NOT NULL CHECK (ordered_quantity_base > 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),
  line_discount numeric(18,4) NOT NULL DEFAULT 0 CHECK (line_discount >= 0),
  expected_date date,
  received_quantity_base numeric(18,6) NOT NULL DEFAULT 0 CHECK (received_quantity_base >= 0),
  invoiced_quantity_base numeric(18,6) NOT NULL DEFAULT 0 CHECK (invoiced_quantity_base >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, product_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_order_line_tenant_id
  ON purchase_order_line (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_line_po
  ON purchase_order_line (tenant_id, purchase_order_id);

ALTER TABLE purchase_order_line
  ADD CONSTRAINT fk_po_line_po_tenant
  FOREIGN KEY (tenant_id, purchase_order_id)
  REFERENCES purchase_order (tenant_id, id);
ALTER TABLE purchase_order_line
  ADD CONSTRAINT fk_po_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
ALTER TABLE purchase_order_line
  ADD CONSTRAINT fk_po_line_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);
ALTER TABLE purchase_order
  ADD CONSTRAINT fk_purchase_order_supplier_tenant
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES supplier (tenant_id, id);
ALTER TABLE purchase_order
  ADD CONSTRAINT fk_purchase_order_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);

-- ------------------------------------------------------------
-- 2. Goods receipt notes (stock-affecting)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goods_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  purchase_order_id uuid REFERENCES purchase_order(id),
  supplier_id uuid NOT NULL REFERENCES supplier(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  business_date date NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  supplier_delivery_ref text,
  notes text,
  received_by uuid REFERENCES app_user(id),
  status text NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_goods_receipt_tenant_id
  ON goods_receipt (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_po
  ON goods_receipt (tenant_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_supplier
  ON goods_receipt (tenant_id, supplier_id, business_date DESC);

CREATE TABLE IF NOT EXISTS goods_receipt_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipt(id) ON DELETE CASCADE,
  purchase_order_line_id uuid REFERENCES purchase_order_line(id),
  product_id uuid NOT NULL REFERENCES product(id),
  unit_id uuid REFERENCES unit(id),
  received_quantity numeric(18,6) NOT NULL CHECK (received_quantity > 0),
  conversion_factor numeric(18,6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  received_quantity_base numeric(18,6) NOT NULL CHECK (received_quantity_base > 0),
  rejected_quantity_base numeric(18,6) NOT NULL DEFAULT 0
    CHECK (rejected_quantity_base >= 0),
  unit_cost numeric(18,4) NOT NULL CHECK (unit_cost >= 0),
  line_value numeric(18,4) NOT NULL CHECK (line_value >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  invoiced_quantity_base numeric(18,6) NOT NULL DEFAULT 0
    CHECK (invoiced_quantity_base >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_goods_receipt_line_tenant_id
  ON goods_receipt_line (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_line_grn
  ON goods_receipt_line (tenant_id, goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_line_pol
  ON goods_receipt_line (tenant_id, purchase_order_line_id);

ALTER TABLE goods_receipt_line
  ADD CONSTRAINT fk_grn_line_grn_tenant
  FOREIGN KEY (tenant_id, goods_receipt_id)
  REFERENCES goods_receipt (tenant_id, id);
ALTER TABLE goods_receipt_line
  ADD CONSTRAINT fk_grn_line_pol_tenant
  FOREIGN KEY (tenant_id, purchase_order_line_id)
  REFERENCES purchase_order_line (tenant_id, id);
ALTER TABLE goods_receipt_line
  ADD CONSTRAINT fk_grn_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
ALTER TABLE goods_receipt_line
  ADD CONSTRAINT fk_grn_line_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);
ALTER TABLE goods_receipt
  ADD CONSTRAINT fk_goods_receipt_po_tenant
  FOREIGN KEY (tenant_id, purchase_order_id)
  REFERENCES purchase_order (tenant_id, id);
ALTER TABLE goods_receipt
  ADD CONSTRAINT fk_goods_receipt_supplier_tenant
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES supplier (tenant_id, id);
ALTER TABLE goods_receipt
  ADD CONSTRAINT fk_goods_receipt_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);

-- ------------------------------------------------------------
-- 3. Supplier invoices (AP-affecting) + match evidence
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES supplier(id),
  supplier_invoice_number text NOT NULL,
  supplier_invoice_date date NOT NULL,
  due_date date,
  payment_terms text,
  business_date date NOT NULL,
  purchase_order_id uuid REFERENCES purchase_order(id),
  status text NOT NULL DEFAULT 'pending_match'
    CHECK (status IN ('pending_match','matched','posted','partially_paid','paid','cancelled')),
  match_state text NOT NULL DEFAULT 'unmatched'
    CHECK (match_state IN ('unmatched','within_tolerance','exceptions_pending',
                           'exceptions_approved','no_po')),
  subtotal numeric(18,4) NOT NULL DEFAULT 0,
  tax_total numeric(18,4) NOT NULL DEFAULT 0,
  tax_inclusive_total numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,4) NOT NULL DEFAULT 0
    CHECK (total = subtotal + tax_total - tax_inclusive_total),
  tax_profile_version_id uuid REFERENCES tax_profile_version(id),
  tax_inclusive boolean NOT NULL DEFAULT false,
  tax_profile_code text,
  notes text,
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  posted_at timestamptz,
  posted_by uuid REFERENCES app_user(id),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  -- duplicate supplier invoice protection (3-way match defect class:
  -- the same supplier document may only enter the books once)
  UNIQUE (tenant_id, supplier_id, supplier_invoice_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_tenant_id
  ON supplier_invoice (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_supplier
  ON supplier_invoice (tenant_id, supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_po
  ON supplier_invoice (tenant_id, purchase_order_id);

CREATE TABLE IF NOT EXISTS supplier_invoice_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoice(id) ON DELETE CASCADE,
  goods_receipt_line_id uuid REFERENCES goods_receipt_line(id),
  purchase_order_line_id uuid REFERENCES purchase_order_line(id),
  product_id uuid REFERENCES product(id),
  expense_account_id uuid REFERENCES gl_account(id),
  description text NOT NULL,
  unit_id uuid REFERENCES unit(id),
  quantity numeric(18,6),
  conversion_factor numeric(18,6),
  quantity_base numeric(18,6) NOT NULL DEFAULT 1 CHECK (quantity_base > 0),
  unit_price numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_discount numeric(18,4) NOT NULL DEFAULT 0 CHECK (line_discount >= 0),
  line_net numeric(18,4) NOT NULL CHECK (line_net >= 0),
  tax_exempt boolean NOT NULL DEFAULT false,
  tax_basis numeric(18,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (product_id IS NOT NULL OR expense_account_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_line_tenant_id
  ON supplier_invoice_line (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_line_si
  ON supplier_invoice_line (tenant_id, supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_line_grnl
  ON supplier_invoice_line (tenant_id, goods_receipt_line_id);

ALTER TABLE supplier_invoice_line
  ADD CONSTRAINT fk_si_line_si_tenant
  FOREIGN KEY (tenant_id, supplier_invoice_id)
  REFERENCES supplier_invoice (tenant_id, id);
ALTER TABLE supplier_invoice_line
  ADD CONSTRAINT fk_si_line_grnl_tenant
  FOREIGN KEY (tenant_id, goods_receipt_line_id)
  REFERENCES goods_receipt_line (tenant_id, id);
ALTER TABLE supplier_invoice_line
  ADD CONSTRAINT fk_si_line_pol_tenant
  FOREIGN KEY (tenant_id, purchase_order_line_id)
  REFERENCES purchase_order_line (tenant_id, id);
ALTER TABLE supplier_invoice_line
  ADD CONSTRAINT fk_si_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
ALTER TABLE supplier_invoice_line
  ADD CONSTRAINT fk_si_line_expense_account_tenant
  FOREIGN KEY (tenant_id, expense_account_id)
  REFERENCES gl_account (tenant_id, id);
ALTER TABLE supplier_invoice_line
  ADD CONSTRAINT fk_si_line_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);
ALTER TABLE supplier_invoice
  ADD CONSTRAINT fk_supplier_invoice_supplier_tenant
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES supplier (tenant_id, id);
ALTER TABLE supplier_invoice
  ADD CONSTRAINT fk_supplier_invoice_po_tenant
  FOREIGN KEY (tenant_id, purchase_order_id)
  REFERENCES purchase_order (tenant_id, id);
ALTER TABLE supplier_invoice
  ADD CONSTRAINT fk_supplier_invoice_tax_version_tenant
  FOREIGN KEY (tenant_id, tax_profile_version_id)
  REFERENCES tax_profile_version (tenant_id, id);

-- transaction-time supplier tax evidence (immutable)
CREATE TABLE IF NOT EXISTS supplier_invoice_tax_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoice(id) ON DELETE CASCADE,
  component_id uuid REFERENCES tax_component(id),
  component_name text NOT NULL,
  rate numeric(9,6) NOT NULL,
  inclusive boolean NOT NULL,
  recoverable boolean NOT NULL DEFAULT false,
  taxable_basis numeric(18,4) NOT NULL,
  tax_amount numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_invoice_id, component_name)
);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_tax_component
  ON supplier_invoice_tax_component (tenant_id, supplier_invoice_id);
ALTER TABLE supplier_invoice_tax_component
  ADD CONSTRAINT fk_sitc_si_tenant
  FOREIGN KEY (tenant_id, supplier_invoice_id)
  REFERENCES supplier_invoice (tenant_id, id);

-- ------------------------------------------------------------
-- 4. 3-way match evidence (PO ordered | GRN received | invoiced)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_review_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoice(id) ON DELETE CASCADE,
  supplier_invoice_line_id uuid REFERENCES supplier_invoice_line(id),
  purchase_order_line_id uuid REFERENCES purchase_order_line(id),
  goods_receipt_line_id uuid REFERENCES goods_receipt_line(id),
  match_dimension text NOT NULL
    CHECK (match_dimension IN ('quantity','price','value','missing_receipt',
                               'invoice_before_receipt','duplicate_invoice',
                               'over_billing','no_po')),
  expected_value numeric(18,6),
  actual_value numeric(18,6),
  variance numeric(18,6),
  severity text NOT NULL CHECK (severity IN ('info','tolerated','approval_required')),
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_review_item_si
  ON match_review_item (tenant_id, supplier_invoice_id);
ALTER TABLE match_review_item
  ADD CONSTRAINT fk_match_item_si_tenant
  FOREIGN KEY (tenant_id, supplier_invoice_id)
  REFERENCES supplier_invoice (tenant_id, id);
ALTER TABLE match_review_item
  ADD CONSTRAINT fk_match_item_si_line_tenant
  FOREIGN KEY (tenant_id, supplier_invoice_line_id)
  REFERENCES supplier_invoice_line (tenant_id, id);
ALTER TABLE match_review_item
  ADD CONSTRAINT fk_match_item_pol_tenant
  FOREIGN KEY (tenant_id, purchase_order_line_id)
  REFERENCES purchase_order_line (tenant_id, id);
ALTER TABLE match_review_item
  ADD CONSTRAINT fk_match_item_grnl_tenant
  FOREIGN KEY (tenant_id, goods_receipt_line_id)
  REFERENCES goods_receipt_line (tenant_id, id);

-- ------------------------------------------------------------
-- 5. Supplier payments + explicit allocations (AP subledger)
--    The open AP balance is ALWAYS derived:
--      Σ supplier_invoice.total (posted)
--    + Σ supplier_adjustment (debit notes − credit notes, posted)
--    − Σ supplier_payment_allocation
--    never from a mutable snapshot column (defect C-24).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  client_doc_id text,
  supplier_id uuid NOT NULL REFERENCES supplier(id),
  business_date date NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  method text NOT NULL
    CHECK (method IN ('cash','momo','cheque','bank_transfer','other')),
  reference text,
  bank_account_id uuid,
  notes text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payment_tenant_id
  ON supplier_payment (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_supplier
  ON supplier_payment (tenant_id, supplier_id, business_date DESC);

CREATE TABLE IF NOT EXISTS supplier_payment_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  payment_id uuid NOT NULL REFERENCES supplier_payment(id) ON DELETE CASCADE,
  supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoice(id),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, supplier_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocation_invoice
  ON supplier_payment_allocation (tenant_id, supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocation_payment
  ON supplier_payment_allocation (tenant_id, payment_id);

ALTER TABLE supplier_payment_allocation
  ADD CONSTRAINT fk_spa_payment_tenant
  FOREIGN KEY (tenant_id, payment_id)
  REFERENCES supplier_payment (tenant_id, id);
ALTER TABLE supplier_payment_allocation
  ADD CONSTRAINT fk_spa_invoice_tenant
  FOREIGN KEY (tenant_id, supplier_invoice_id)
  REFERENCES supplier_invoice (tenant_id, id);
ALTER TABLE supplier_payment
  ADD CONSTRAINT fk_supplier_payment_supplier_tenant
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES supplier (tenant_id, id);

-- payment-side conservation: Σ allocations ≤ payment amount
-- (invoice-side over-allocation is enforced by the posting service
-- under a per-invoice advisory lock; it needs the full AP equation)
CREATE OR REPLACE FUNCTION trg_supplier_payment_allocation_guard() RETURNS trigger AS $$
DECLARE
  v_payment uuid;
  v_total numeric(18,4);
  v_amount numeric(18,4);
BEGIN
  v_payment := CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_id ELSE NEW.payment_id END;
  SELECT amount INTO v_amount FROM supplier_payment WHERE id = v_payment;
  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM supplier_payment_allocation WHERE payment_id = v_payment;
  IF v_total > v_amount THEN
    RAISE EXCEPTION 'supplier payment allocations exceed the payment amount'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE CONSTRAINT TRIGGER supplier_payment_allocation_guard
  AFTER INSERT OR UPDATE OR DELETE ON supplier_payment_allocation
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_supplier_payment_allocation_guard();

-- ------------------------------------------------------------
-- 6. Supplier adjustments (debit / credit notes) — append-only
--    corrections; the source supplier invoice is never edited.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('debit_note','credit_note')),
  supplier_id uuid NOT NULL REFERENCES supplier(id),
  supplier_invoice_id uuid REFERENCES supplier_invoice(id),
  business_date date NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  adjustment_class text NOT NULL
    CHECK (adjustment_class IN ('price_correction','quantity_correction',
                                'returns','other')),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  stock_return boolean NOT NULL DEFAULT false,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_adjustment_tenant_id
  ON supplier_adjustment (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_supplier_adjustment_supplier
  ON supplier_adjustment (tenant_id, supplier_id, business_date DESC);
ALTER TABLE supplier_adjustment
  ADD CONSTRAINT fk_supplier_adjustment_supplier_tenant
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES supplier (tenant_id, id);
ALTER TABLE supplier_adjustment
  ADD CONSTRAINT fk_supplier_adjustment_invoice_tenant
  FOREIGN KEY (tenant_id, supplier_invoice_id)
  REFERENCES supplier_invoice (tenant_id, id);

CREATE TABLE IF NOT EXISTS supplier_adjustment_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  supplier_adjustment_id uuid NOT NULL REFERENCES supplier_adjustment(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  description text,
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_adjustment_line_sa
  ON supplier_adjustment_line (tenant_id, supplier_adjustment_id);
ALTER TABLE supplier_adjustment_line
  ADD CONSTRAINT fk_sa_line_sa_tenant
  FOREIGN KEY (tenant_id, supplier_adjustment_id)
  REFERENCES supplier_adjustment (tenant_id, id);
ALTER TABLE supplier_adjustment_line
  ADD CONSTRAINT fk_sa_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'purchase_order','purchase_order_line',
    'goods_receipt','goods_receipt_line',
    'supplier_invoice','supplier_invoice_line','supplier_invoice_tax_component',
    'match_review_item',
    'supplier_payment','supplier_payment_allocation',
    'supplier_adjustment','supplier_adjustment_line']
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
GRANT SELECT, INSERT, UPDATE ON
  purchase_order, purchase_order_line,
  supplier_invoice, supplier_invoice_line,
  match_review_item
  TO idepot_app;
-- posted receipts / payments / adjustments / evidence are append-only
GRANT SELECT, INSERT ON
  goods_receipt, goods_receipt_line,
  supplier_invoice_tax_component,
  supplier_payment, supplier_payment_allocation,
  supplier_adjustment, supplier_adjustment_line
  TO idepot_app;
