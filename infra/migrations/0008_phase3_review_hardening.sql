-- ============================================================
-- 0008_phase3_review_hardening.sql — Phase 3 blocking re-review
-- (second independent review, head 0c749eb).
--
-- ADDITIVE / CORRECTIVE ONLY: 0001–0007 are already pushed and their
-- history is never rewritten. This migration closes the remaining
-- blockers:
--
--  1. TAX APPLICABILITY IS SERVER-AUTHORITATIVE (P0): exemption
--     resolves from server configuration (product.tax_exempt, NEW
--     customer.tax_exempt) or a separately permissioned + audited
--     override. invoice_line gains the exemption SOURCE evidence
--     ('product' | 'customer' | 'override') and the override reason —
--     a client payload can no longer suppress tax.
--
--  2. INVOICE REVERSAL (P0): append-only invoice_reversal documents
--     (reason mandatory, one reversal per invoice, idempotent
--     client_doc_id), invoice status gains 'reversed' + reversed_at,
--     and a new INVOICE_REVERSAL document-sequence type numbers the
--     correction documents. Stock/AVCO/AR/revenue/tax/GL are inversed
--     by the service inside ONE transaction (reversal movements copy
--     the original cost evidence verbatim; the reversal journal
--     inverts the original sale journal).
--
--  3. QUOTATION LIFECYCLE (P1): draft → issued → accepted →
--     rejected | expired → converted (+ manual cancel before
--     conversion), with issued_at/accepted_at evidence and a
--     status_reason recorded on the non-conversion outcomes.
--
--  4. TENANT-REFERENCE HARDENING (P1): every remaining plain UUID
--     foreign key on the Phase 3 financial schema is replaced by the
--     Phase 2 composite (tenant_id, ref) defense-in-depth pattern —
--     a tenant-A row can no longer reference tenant-B financial rows
--     even at the raw DB boundary (FK checks bypass RLS).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tax exemption: server-side sources + transaction-time evidence
-- ------------------------------------------------------------
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

ALTER TABLE invoice_line
  ADD COLUMN IF NOT EXISTS tax_exemption_source text
    CHECK (tax_exemption_source IS NULL OR tax_exemption_source IN ('product','customer','override')),
  ADD COLUMN IF NOT EXISTS tax_exemption_reason text;

-- ------------------------------------------------------------
-- 2. Invoice reversal
-- ------------------------------------------------------------
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_status_check;
ALTER TABLE invoice
  ADD CONSTRAINT invoice_status_check
  CHECK (status IN ('posted','voided','reversed'));
ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

-- the correction document gets its own numbering space
ALTER TABLE document_sequence DROP CONSTRAINT IF EXISTS document_sequence_doc_type_check;
ALTER TABLE document_sequence
  ADD CONSTRAINT document_sequence_doc_type_check
  CHECK (doc_type IN ('QUOTATION','SALE_ORDER','INVOICE','RECEIPT','WAYBILL','DEPOSIT','INVOICE_REVERSAL'));

CREATE TABLE IF NOT EXISTS invoice_reversal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  invoice_id uuid NOT NULL,
  code text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  journal_entry_id uuid,
  -- the deposit that restores value the customer had already settled on
  -- the reversed invoice (later receipts + consumed credit) — NULL when
  -- nothing had been settled
  restored_deposit_id uuid,
  client_doc_id uuid,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  -- one reversal per invoice, enforced by the database (concurrency control)
  UNIQUE (tenant_id, invoice_id),
  -- idempotent retry identity for the correction command itself
  UNIQUE (tenant_id, client_doc_id)
);

-- ------------------------------------------------------------
-- 3. Quotation lifecycle evidence
-- ------------------------------------------------------------
ALTER TABLE quotation DROP CONSTRAINT IF EXISTS quotation_status_check;
ALTER TABLE quotation
  ADD CONSTRAINT quotation_status_check
  CHECK (status IN ('draft','issued','accepted','rejected','expired','converted','cancelled'));
ALTER TABLE quotation
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason text;

-- ------------------------------------------------------------
-- 4. Composite (tenant_id, ref) foreign keys — Phase 2 pattern.
--    FK enforcement queries run with table-owner privileges and
--    BYPASS RLS, so a plain UUID FK is the one path a tenant-A
--    session could use to attach tenant-B financial rows. Every
--    single-column entity reference on the Phase 3 schema is
--    replaced by (tenant_id, ref) REFERENCES target (tenant_id, id).
-- ------------------------------------------------------------

-- 4a. composite-FK targets need the (tenant_id, id) unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_tenant_id ON branch (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_tenant_id ON device (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_sequence_tenant_id ON document_sequence (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_booklet_tenant_id ON document_booklet (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_shift_tenant_id ON cashier_shift (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotation_tenant_id ON quotation (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_order_tenant_id ON sales_order (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_order_line_tenant_id ON sales_order_line (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fulfillment_tenant_id ON fulfillment (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_tenant_id ON invoice (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tenant_id ON payment (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_deposit_tenant_id ON customer_deposit (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entry_tenant_id ON journal_entry (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_profile_tenant_id ON tax_profile (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_profile_version_tenant_id ON tax_profile_version (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_component_tenant_id ON tax_component (tenant_id, id);

-- 4b. drop every remaining single-column plain FK and add the composite
--     equivalent (same referential action). Auto-generated constraint
--     names are located by (table, column, target), so this is robust
--     against naming variance across PostgreSQL versions.
DO $$
DECLARE
  spec text;
  tbl text; col text; tgt text; casc text;
  c record;
BEGIN
  FOREACH spec IN ARRAY ARRAY[
    -- document numbering
    'document_sequence|branch_id|branch|',
    'document_booklet_code|booklet_id|document_booklet|cascade',
    'sequence_lease|device_id|device|',
    'sequence_lease|sequence_id|document_sequence|',
    -- shifts
    'cashier_shift|device_id|device|',
    'cashier_shift|warehouse_id|warehouse|',
    'shift_cash_movement|shift_id|cashier_shift|cascade',
    -- quotations / orders / fulfillments
    'quotation_line|quotation_id|quotation|cascade',
    'sales_order|quotation_id|quotation|',
    'sales_order_line|order_id|sales_order|cascade',
    'fulfillment|sales_order_id|sales_order|',
    'fulfillment_line|fulfillment_id|fulfillment|cascade',
    'fulfillment_line|order_line_id|sales_order_line|',
    -- invoices / payments / deposits / credit
    'invoice|sales_order_id|sales_order|',
    'invoice|shift_id|cashier_shift|',
    'invoice_line|invoice_id|invoice|cascade',
    'payment|shift_id|cashier_shift|',
    'payment_tender|payment_id|payment|cascade',
    'payment_allocation|payment_id|payment|',
    'payment_allocation|invoice_id|invoice|',
    'customer_deposit|payment_id|payment|',
    'customer_deposit|shift_id|cashier_shift|',
    'credit_application|deposit_id|customer_deposit|',
    'credit_application|invoice_id|invoice|',
    -- offline sync registry
    'sync_applied_event|device_id|device|',
    -- tax engine
    'tax_profile_version|profile_id|tax_profile|',
    'tax_component|version_id|tax_profile_version|cascade',
    'invoice_tax_component|invoice_id|invoice|cascade',
    'invoice_tax_component|component_id|tax_component|',
    -- GL + cost state
    'journal_line|entry_id|journal_entry|cascade',
    'stock_cost_state|warehouse_id|warehouse|',
    'stock_cost_state|product_id|product|'
  ]
  LOOP
    tbl  := split_part(spec, '|', 1);
    col  := split_part(spec, '|', 2);
    tgt  := split_part(spec, '|', 3);
    casc := split_part(spec, '|', 4);
    FOR c IN
      SELECT conname
        FROM pg_constraint
       WHERE conrelid = tbl::regclass
         AND contype = 'f'
         AND confrelid = tgt::regclass
         AND conkey = ARRAY[
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = tbl::regclass AND attname = col AND NOT attisdropped)
         ]::smallint[]
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, c.conname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %I) REFERENCES %I (tenant_id, id)%s',
      tbl, 'fk_' || tbl || '_' || col || '_tenant', col, tgt,
      CASE WHEN casc = 'cascade' THEN ' ON DELETE CASCADE' ELSE '' END);
  END LOOP;
END
$$;

-- 4c. plain single-column FKs whose composite twin already exists
--     (0006/0007 added both): drop the redundant plain constraint and
--     keep the composite one as the only referential path.
DO $$
DECLARE
  spec text;
  tbl text; col text; tgt text;
  c record;
BEGIN
  FOREACH spec IN ARRAY ARRAY[
    'quotation|warehouse_id|warehouse',
    'quotation|customer_id|customer',
    'quotation_line|product_id|product',
    'quotation_line|unit_id|unit',
    'sales_order|warehouse_id|warehouse',
    'sales_order|customer_id|customer',
    'sales_order_line|product_id|product',
    'sales_order_line|unit_id|unit',
    'fulfillment|warehouse_id|warehouse',
    'fulfillment_line|product_id|product',
    'invoice|warehouse_id|warehouse',
    'invoice|customer_id|customer',
    'invoice_line|product_id|product',
    'invoice_line|unit_id|unit',
    'payment|customer_id|customer',
    'customer_deposit|customer_id|customer',
    'invoice|tax_profile_version_id|tax_profile_version',
    'invoice_line|cost_policy_version_id|cost_policy_version',
    'journal_line|account_id|gl_account',
    'gl_mapping|account_id|gl_account'
  ]
  LOOP
    tbl := split_part(spec, '|', 1);
    col := split_part(spec, '|', 2);
    tgt := split_part(spec, '|', 3);
    FOR c IN
      SELECT conname
        FROM pg_constraint
       WHERE conrelid = tbl::regclass
         AND contype = 'f'
         AND confrelid = tgt::regclass
         AND conkey = ARRAY[
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = tbl::regclass AND attname = col AND NOT attisdropped)
         ]::smallint[]
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, c.conname);
    END LOOP;
  END LOOP;
END
$$;

-- 4d. the new reversal table references through the same composite pattern
ALTER TABLE invoice_reversal
  ADD CONSTRAINT fk_invoice_reversal_invoice_tenant
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoice (tenant_id, id);
ALTER TABLE invoice_reversal
  ADD CONSTRAINT fk_invoice_reversal_journal_tenant
  FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES journal_entry (tenant_id, id);
ALTER TABLE invoice_reversal
  ADD CONSTRAINT fk_invoice_reversal_deposit_tenant
  FOREIGN KEY (tenant_id, restored_deposit_id) REFERENCES customer_deposit (tenant_id, id);

-- ------------------------------------------------------------
-- RLS + grants
-- ------------------------------------------------------------
ALTER TABLE invoice_reversal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON invoice_reversal;
CREATE POLICY tenant_isolation ON invoice_reversal
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- append-only correction documents: no UPDATE, no DELETE for the app role
GRANT SELECT, INSERT ON invoice_reversal TO idepot_app;

CREATE INDEX IF NOT EXISTS idx_invoice_reversal_invoice
  ON invoice_reversal (tenant_id, invoice_id);
