-- ============================================================
-- 0006_phase3_sales_pos.sql — Phase 3: sales & POS.
--
-- Document numbering (sequences + pre-printed booklets + offline leases),
-- quotations, sales orders (state machine), fulfillments/waybills,
-- invoices, payments (tenders + explicit allocations), customer deposits
-- (unapplied credit) + credit applications, cashier shifts, and the
-- offline-sync idempotency registry.
--
-- Posting rule (ROADMAP Phase 3): every sale/payment commits document +
-- stock + COGS + tender + allocation + subledger + audit + outbox in ONE
-- transaction through the Posting Coordinator. GL journal lines + tax
-- lines arrive with the Phase 4 posting engine (chart of accounts); the
-- coordinator participant model takes them without restructuring — same
-- precedent as the Phase 2 opening-balance documents.
--
-- Financial rows (payment*, customer_deposit, credit_application) are
-- APPEND-ONLY for the app role: no UPDATE, no DELETE (corrected model:
-- reversals are new documents — never the legacy destructive edit).
-- ============================================================

-- ------------------------------------------------------------
-- Oversell policy config (offline-sync §5b). Default 'reject' preserves
-- the Phase 2 fail-loud behaviour; 'allow_backorder' lets a synced sale
-- post with a prominent exception task (ledger arithmetic always wins).
-- The old stock_balance non-negative CHECK is hereby relaxed to a sanity
-- bound: 0004 documented it as the until-offline-sync fail-loud gate, and
-- the offline policy 'allow as negative/backorder' requires negative
-- projections to be representable. Non-negativity for the default policy
-- stays enforced in the poster (tested), not in the schema.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_config (
  tenant_id uuid PRIMARY KEY REFERENCES tenant(id),
  oversell_policy text NOT NULL DEFAULT 'reject'
    CHECK (oversell_policy IN ('reject', 'allow_backorder')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_balance DROP CONSTRAINT IF EXISTS stock_balance_quantity_base_check;
ALTER TABLE stock_balance
  ADD CONSTRAINT stock_balance_quantity_base_sanity
  CHECK (quantity_base > -1000000000);

-- ------------------------------------------------------------
-- Document numbering (document-numbering §5 corrected model).
-- Counter sequences are atomic (row-locked UPDATE .. RETURNING); booklet
-- codes are imported pre-printed numbers allocated IN ORDER under lock;
-- leases hand contiguous ranges to offline devices.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_sequence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  doc_type text NOT NULL
    CHECK (doc_type IN ('QUOTATION','SALE_ORDER','INVOICE','RECEIPT','WAYBILL','DEPOSIT')),
  branch_id uuid REFERENCES branch(id),
  prefix text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding int NOT NULL DEFAULT 5 CHECK (padding BETWEEN 1 AND 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_type, branch_id)
);
-- nullable branch must still be unique per (tenant, doc_type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_sequence_branch_null
  ON document_sequence (tenant_id, doc_type)
  WHERE branch_id IS NULL;

-- Pre-printed booklet (invoice_code / waybill_code legacy table, corrected:
-- read-then-use races replaced by FOR UPDATE allocation; every transition
-- audited; 'not used' + mandatory reason preserved as first-class spoilage).
CREATE TABLE IF NOT EXISTS document_booklet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  doc_type text NOT NULL CHECK (doc_type IN ('INVOICE','WAYBILL')),
  code_range text,
  source text NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','imported')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_booklet_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  booklet_id uuid NOT NULL REFERENCES document_booklet(id) ON DELETE CASCADE,
  seq int NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','allocated','not_used')),
  reason text,
  allocated_document_type text,
  allocated_document_id uuid,
  allocated_by uuid REFERENCES app_user(id),
  allocated_at timestamptz,
  UNIQUE (tenant_id, code),
  UNIQUE (booklet_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_booklet_code_alloc
  ON document_booklet_code (tenant_id, booklet_id, seq) WHERE status = 'open';

-- Offline lease: contiguous numeric range leased to a device per doc type.
CREATE TABLE IF NOT EXISTS sequence_lease (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  device_id uuid NOT NULL REFERENCES device(id),
  doc_type text NOT NULL
    CHECK (doc_type IN ('INVOICE','RECEIPT','SALE_ORDER','WAYBILL')),
  sequence_id uuid NOT NULL REFERENCES document_sequence(id),
  prefix text NOT NULL,
  start_value bigint NOT NULL CHECK (start_value > 0),
  end_value bigint NOT NULL CHECK (end_value >= start_value),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (sequence_id, start_value)
);

-- ------------------------------------------------------------
-- Cashier shifts (C-11 corrected: shift-scoped session; variance =
-- counted − expected; expected = float + cash tenders + paid-in − paid-out
-- − change given, derived at close from the posted documents).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cashier_shift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user(id),
  device_id uuid REFERENCES device(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_float numeric(18,4) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES app_user(id),
  expected_cash numeric(18,4),
  counted_cash numeric(18,4),
  variance numeric(18,4),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shift_cash_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  shift_id uuid NOT NULL REFERENCES cashier_shift(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Quotations (legacy proforma_invoice + proforma_invoice_order).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  customer_id uuid REFERENCES customer(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','converted','cancelled')),
  valid_until date,
  converted_order_id uuid,
  note text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS quotation_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  quotation_id uuid NOT NULL REFERENCES quotation(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  unit_id uuid REFERENCES unit(id),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),
  line_net numeric(18,4) NOT NULL CHECK (line_net >= 0),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (quotation_id, product_id)
);

-- ------------------------------------------------------------
-- Sales orders (state machine per sales-pos-lifecycle §5 target model).
-- Confirmed orders are financially live: confirmation posts the invoice.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  customer_id uuid REFERENCES customer(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','partially_fulfilled','fulfilled','closed','cancelled')),
  quotation_id uuid REFERENCES quotation(id),
  order_discount numeric(18,4) NOT NULL DEFAULT 0 CHECK (order_discount >= 0),
  subtotal numeric(18,4) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total numeric(18,4) NOT NULL DEFAULT 0 CHECK (total >= 0),
  invoice_id uuid,
  note text,
  created_by uuid REFERENCES app_user(id),
  confirmed_by uuid REFERENCES app_user(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS sales_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  order_id uuid NOT NULL REFERENCES sales_order(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  unit_id uuid REFERENCES unit(id),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),
  line_net numeric(18,4) NOT NULL CHECK (line_net >= 0),
  fulfilled_quantity_base numeric(18,6) NOT NULL DEFAULT 0
    CHECK (fulfilled_quantity_base >= 0),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (order_id, product_id)
);
-- fulfillment can never exceed the ordered quantity (no silent over-delivery)
ALTER TABLE sales_order_line
  ADD CONSTRAINT sales_order_line_fulfilled_not_over
  CHECK (fulfilled_quantity_base <= quantity_base);

-- ------------------------------------------------------------
-- Fulfillments / waybills: DELIVERY documents against a confirmed order.
-- Stock moved at sale (invoice) time — the waybill records the physical
-- handover of already-sold goods (legacy quantity_picked semantics,
-- quantity_due = quantity − picked preserved via the line counters).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fulfillment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  sales_order_id uuid NOT NULL REFERENCES sales_order(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','dispatched','delivered','cancelled')),
  dispatched_by uuid REFERENCES app_user(id),
  dispatched_at timestamptz,
  delivered_by uuid REFERENCES app_user(id),
  delivered_at timestamptz,
  note text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS fulfillment_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  fulfillment_id uuid NOT NULL REFERENCES fulfillment(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES sales_order_line(id),
  product_id uuid NOT NULL REFERENCES product(id),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  UNIQUE (fulfillment_id, order_line_id)
);

-- ------------------------------------------------------------
-- Invoices (the AR subledger anchor). Posted at sale time; totals computed
-- SERVER-side once on the header (C-2); cost_at_sale snapshots the cost
-- basis per line (Phase 4 makes the method configurable; Phase 3 uses the
-- purchase-price snapshot like the legacy cost_price column).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  sales_order_id uuid REFERENCES sales_order(id),
  customer_id uuid REFERENCES customer(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  shift_id uuid REFERENCES cashier_shift(id),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','voided')),
  subtotal numeric(18,4) NOT NULL CHECK (subtotal >= 0),
  order_discount numeric(18,4) NOT NULL DEFAULT 0 CHECK (order_discount >= 0),
  total numeric(18,4) NOT NULL CHECK (total >= 0),
  cost_total numeric(18,4),
  change_given numeric(18,4) NOT NULL DEFAULT 0 CHECK (change_given >= 0),
  source text NOT NULL DEFAULT 'pos'
    CHECK (source IN ('pos','order','sync','migration')),
  client_doc_id uuid,
  business_date date NOT NULL DEFAULT CURRENT_DATE,
  occurred_at timestamptz,
  note text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id),
  CHECK (order_discount <= subtotal),
  CHECK (total = subtotal - order_discount)
);

CREATE TABLE IF NOT EXISTS invoice_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  invoice_id uuid NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  unit_id uuid REFERENCES unit(id),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base > 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),
  line_net numeric(18,4) NOT NULL CHECK (line_net >= 0),
  resolved_price numeric(18,4),
  price_source text,
  price_overridden boolean NOT NULL DEFAULT false,
  cost_at_sale numeric(18,4),
  note text,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (invoice_id, product_id)
);

-- ------------------------------------------------------------
-- Payments + tenders + explicit allocations (payment-transaction-map §10
-- corrected model). method='credit' tenders live only on SALE commits
-- (they consume a deposit inside the sale transaction); standalone
-- receipts use money tenders. D1-proof by construction: per-tender rows,
-- per-allocation rows — no per-account multiplication is even expressible.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customer(id),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  change_given numeric(18,4) NOT NULL DEFAULT 0 CHECK (change_given >= 0),
  unapplied numeric(18,4) NOT NULL DEFAULT 0 CHECK (unapplied >= 0),
  shift_id uuid REFERENCES cashier_shift(id),
  source text NOT NULL DEFAULT 'counter'
    CHECK (source IN ('counter','sale','sync','migration')),
  client_doc_id uuid,
  business_date date NOT NULL DEFAULT CURRENT_DATE,
  occurred_at timestamptz,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id)
);

CREATE TABLE IF NOT EXISTS payment_tender (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  payment_id uuid NOT NULL REFERENCES payment(id) ON DELETE CASCADE,
  method text NOT NULL
    CHECK (method IN ('cash','momo','cheque','bank_transfer','credit')),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  momo_provider text CHECK (momo_provider IN ('MTN','Vodafone','AirtelTigo')),
  momo_phone text,
  momo_transaction_id text,
  cheque_bank text,
  cheque_branch text,
  cheque_number text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  payment_id uuid NOT NULL REFERENCES payment(id),
  invoice_id uuid NOT NULL REFERENCES invoice(id),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);
-- Σ allocations of a payment can never exceed the payment amount
-- (invariant 8: amount == Σ allocations + change + unapplied).
-- CHECK constraints cannot contain subqueries, so this is a constraint
-- trigger evaluated at commit under READ COMMITTED... deliberately NOT
-- deferred: the allocation service inserts allocations inside the posting
-- transaction while holding the payment row FOR UPDATE, so concurrent
-- allocations to the same payment serialize on that lock.
CREATE OR REPLACE FUNCTION trg_payment_allocation_guard() RETURNS trigger AS $$
DECLARE
  budget numeric(18,4);
  allocated numeric(18,4);
BEGIN
  SELECT amount - change_given - unapplied INTO budget
    FROM payment WHERE id = NEW.payment_id;
  IF budget IS NULL THEN
    RAISE EXCEPTION 'payment % not found', NEW.payment_id;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO allocated
    FROM payment_allocation WHERE payment_id = NEW.payment_id;
  IF allocated > budget THEN
    RAISE EXCEPTION 'payment allocations (%) exceed the allocatable amount (%)',
      allocated, budget
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER payment_allocation_guard
  AFTER INSERT ON payment_allocation
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION trg_payment_allocation_guard();

-- ------------------------------------------------------------
-- Customer deposits (unapplied credit, C-20/C-26 corrected: a liability
-- document — NOT a negative invoice row) + credit applications (legacy
-- cash_deposit_disbursement). Consumed by credit tenders at sale time or
-- explicit apply-credit; waterfall order enforced in the service.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_deposit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customer(id),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  payment_id uuid REFERENCES payment(id),
  shift_id uuid REFERENCES cashier_shift(id),
  client_doc_id uuid,
  note text,
  business_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, client_doc_id)
);

CREATE TABLE IF NOT EXISTS credit_application (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  deposit_id uuid NOT NULL REFERENCES customer_deposit(id),
  invoice_id uuid NOT NULL REFERENCES invoice(id),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deposit_id, invoice_id)
);

-- ------------------------------------------------------------
-- Offline sync idempotency registry (offline-sync §4.4): every pushed
-- event is applied in exactly one PG transaction; the registry row is
-- written in the SAME transaction, so a replay either finds the stored
-- result (duplicate → same response) or applies fresh. Kill-mid-push
-- rolls back BOTH the documents and the registry row → retry is safe.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_applied_event (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  device_id uuid NOT NULL REFERENCES device(id),
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('applied','conflict','rejected')),
  response jsonb NOT NULL,
  occurred_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

-- ------------------------------------------------------------
-- Query indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoice_tenant_date ON invoice (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_customer ON invoice (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_so ON invoice (sales_order_id) WHERE sales_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_tenant_date ON payment (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_customer ON payment (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_allocation_invoice ON payment_allocation (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_deposit_customer ON customer_deposit (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_app_deposit ON credit_application (tenant_id, deposit_id);
CREATE INDEX IF NOT EXISTS idx_credit_app_invoice ON credit_application (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_tenant_date ON sales_order (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON fulfillment (tenant_id, sales_order_id);
CREATE INDEX IF NOT EXISTS idx_shift_user_status ON cashier_shift (tenant_id, user_id, status);

-- ------------------------------------------------------------
-- Tenant-aware composite FKs (Phase 2 review fix 4 pattern): a cross-tenant
-- reference is structurally impossible, RLS is defense-in-depth.
-- ------------------------------------------------------------
ALTER TABLE sales_order ADD CONSTRAINT fk_sales_order_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);
ALTER TABLE sales_order ADD CONSTRAINT fk_sales_order_customer_tenant
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer (tenant_id, id);
ALTER TABLE quotation ADD CONSTRAINT fk_quotation_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);
ALTER TABLE quotation ADD CONSTRAINT fk_quotation_customer_tenant
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer (tenant_id, id);
ALTER TABLE quotation_line ADD CONSTRAINT fk_quotation_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
ALTER TABLE quotation_line ADD CONSTRAINT fk_quotation_line_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);
ALTER TABLE sales_order_line ADD CONSTRAINT fk_sales_order_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
ALTER TABLE sales_order_line ADD CONSTRAINT fk_sales_order_line_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);
ALTER TABLE fulfillment ADD CONSTRAINT fk_fulfillment_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);
ALTER TABLE fulfillment_line ADD CONSTRAINT fk_fulfillment_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
ALTER TABLE invoice ADD CONSTRAINT fk_invoice_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);
ALTER TABLE invoice ADD CONSTRAINT fk_invoice_customer_tenant
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer (tenant_id, id);
ALTER TABLE invoice_line ADD CONSTRAINT fk_invoice_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
ALTER TABLE invoice_line ADD CONSTRAINT fk_invoice_line_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);
ALTER TABLE payment ADD CONSTRAINT fk_payment_customer_tenant
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer (tenant_id, id);
ALTER TABLE customer_deposit ADD CONSTRAINT fk_deposit_customer_tenant
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer (tenant_id, id);

-- ------------------------------------------------------------
-- RLS + grants
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_config','document_sequence','document_booklet','document_booklet_code',
    'sequence_lease','cashier_shift','shift_cash_movement',
    'quotation','quotation_line','sales_order','sales_order_line',
    'fulfillment','fulfillment_line','invoice','invoice_line',
    'payment','payment_tender','payment_allocation',
    'customer_deposit','credit_application','sync_applied_event']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END
$$;

-- configurable documents (Phase 3)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  quotation, quotation_line, sales_order, sales_order_line,
  fulfillment, fulfillment_line, invoice, invoice_line,
  cashier_shift, shift_cash_movement,
  document_sequence, document_booklet, document_booklet_code, sequence_lease,
  tenant_config
  TO idepot_app;
-- financial rows are append-only (reversals are new documents; corrected
-- model — no destructive edits like the legacy delete_payment_received)
GRANT SELECT, INSERT ON
  payment, payment_tender, payment_allocation,
  customer_deposit, credit_application
  TO idepot_app;
GRANT SELECT, INSERT ON sync_applied_event TO idepot_app;

-- ------------------------------------------------------------
-- legacy_raw staging extensions (sales cycle, verbatim text staging)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_raw.sales_order (
  id text, so_code text, customer_id text, item_id text, quantity text,
  quantity_picked text, price text, amount text, grand_total text,
  amount_paid text, amount_due text, status text, type_of_sales text,
  negative_or_goods text, opening_entry text, cost_price text,
  item_balance text, total_quantity text, order_item_has_unit_sales text,
  bundle_quantity text, bundle_price text, date_timestamp text, track_code text,
  created_by text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.payment_with_goods (
  id text, so_code text, customer_id text, item_id text, quantity text,
  quantity_picked text, quantity_due text, price text, amount text,
  grand_total text, amount_paid text, amount_due text, status text,
  type_of_sales text, waybill_code text, invoice_code text,
  date_timestamp text, track_code text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.invoice (
  id text, invoice_code text, so_code text, customer_id text,
  amount text, amount_paid text, amount_due text, status text,
  date_timestamp text, track_code text, opening_entry text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.payment (
  id text, receipt_code text, amount text, payment_type text, category text,
  customer_id text, invoice_code text, so_code text, method_account text,
  bank_name text, branch text, cheque_number text, momo_phone text,
  momo_transaction_id text, momo_type text, timestamp text, track_code text,
  cash_sales_in_payables text, due text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.proforma_invoice (
  id text, invoice_code text, so_code text, customer_id text,
  amount text, date_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.proforma_invoice_order (
  id text, so_code text, item_id text, quantity text, price text,
  amount text, unit_or_package text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.cash_deposit_disbursement (
  id text, so_code text, invoice_code text, deposit_code text, amount text,
  date_timestamp text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.invoice_code (
  id text, code text, status text, reason text, customer_id text,
  code_range text, created_by text, created_date text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.waybill_code (
  id text, code text, status text, reason text, customer_id text,
  code_range text, created_by text, created_date text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);
