-- ============================================================
-- 0005_phase2_inventory_hardening.sql — PR #3 review fixes:
-- closes tenant-reference isolation gaps (composite tenant-aware
-- FKs) and makes movement reversal concurrency-idempotent at the
-- database level (partial unique index on reversal_of).
--
-- Applied migrations are immutable (runner checksums), so this is
-- an additive corrective migration — no 0001-0004 file is edited.
--
-- Why composite FKs: a plain FK to entity(id) only proves the row
-- exists SOMEWHERE; it does not prove it belongs to the current
-- tenant. (tenant_id, <ref>) -> parent(tenant_id, id) makes a
-- cross-tenant reference structurally impossible, while RLS and
-- the application's RLS-filtered reference checks (404/409) stay
-- the first line of defense for clean error responses.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Single-reversal guarantee (review fix 5): a movement can be
--    reversed at most once, enforced by the database regardless of
--    concurrent transactions. Unique on reversal_of where present.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movement_reversal_of
  ON stock_movement (reversal_of) WHERE reversal_of IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Unique (tenant_id, id) targets for tenant-aware composite FKs.
--    (A unique index is a valid FK target in PostgreSQL.)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_tenant_id ON warehouse (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_tenant_id ON product (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_tenant_id ON unit (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_category_tenant_id ON product_category (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_tenant_id ON brand (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_tenant_id ON supplier (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tenant_id ON customer (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_list_tenant_id ON price_list (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_count_tenant_id ON stock_count (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_adjustment_tenant_id ON stock_adjustment (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_tenant_id ON transfer (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movement_tenant_id ON stock_movement (tenant_id, id);

-- ------------------------------------------------------------
-- 3. Swap Phase 2 single-column FKs for tenant-aware composites.
--    Drop the auto-named constraints, then add composites. User
--    FKs (app_user) are server-derived from the JWT principal and
--    are left single-column by design.
-- ------------------------------------------------------------

-- catalog (0003) ----------------------------------------------------------

ALTER TABLE product_category DROP CONSTRAINT IF EXISTS product_category_parent_id_fkey;
ALTER TABLE product_category
  ADD CONSTRAINT fk_product_category_parent_tenant
  FOREIGN KEY (tenant_id, parent_id) REFERENCES product_category (tenant_id, id);

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_category_id_fkey;
ALTER TABLE product
  ADD CONSTRAINT fk_product_category_tenant
  FOREIGN KEY (tenant_id, category_id) REFERENCES product_category (tenant_id, id);

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_supplier_id_fkey;
ALTER TABLE product
  ADD CONSTRAINT fk_product_supplier_tenant
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES supplier (tenant_id, id);

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_brand_id_fkey;
ALTER TABLE product
  ADD CONSTRAINT fk_product_brand_tenant
  FOREIGN KEY (tenant_id, brand_id) REFERENCES brand (tenant_id, id);

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_base_unit_id_fkey;
ALTER TABLE product
  ADD CONSTRAINT fk_product_base_unit_tenant
  FOREIGN KEY (tenant_id, base_unit_id) REFERENCES unit (tenant_id, id);

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_default_sale_unit_id_fkey;
ALTER TABLE product
  ADD CONSTRAINT fk_product_default_sale_unit_tenant
  FOREIGN KEY (tenant_id, default_sale_unit_id) REFERENCES unit (tenant_id, id);

ALTER TABLE product_unit DROP CONSTRAINT IF EXISTS product_unit_product_id_fkey;
ALTER TABLE product_unit
  ADD CONSTRAINT fk_product_unit_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE product_unit DROP CONSTRAINT IF EXISTS product_unit_unit_id_fkey;
ALTER TABLE product_unit
  ADD CONSTRAINT fk_product_unit_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);

ALTER TABLE product_barcode DROP CONSTRAINT IF EXISTS product_barcode_product_id_fkey;
ALTER TABLE product_barcode
  ADD CONSTRAINT fk_product_barcode_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE price_list DROP CONSTRAINT IF EXISTS price_list_customer_id_fkey;
ALTER TABLE price_list
  ADD CONSTRAINT fk_price_list_customer_tenant
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer (tenant_id, id);

ALTER TABLE price_list_item DROP CONSTRAINT IF EXISTS price_list_item_price_list_id_fkey;
ALTER TABLE price_list_item
  ADD CONSTRAINT fk_price_list_item_price_list_tenant
  FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_list (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE price_list_item DROP CONSTRAINT IF EXISTS price_list_item_product_id_fkey;
ALTER TABLE price_list_item
  ADD CONSTRAINT fk_price_list_item_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);

ALTER TABLE price_list_item DROP CONSTRAINT IF EXISTS price_list_item_unit_id_fkey;
ALTER TABLE price_list_item
  ADD CONSTRAINT fk_price_list_item_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);

-- inventory (0004) --------------------------------------------------------

ALTER TABLE stock_count DROP CONSTRAINT IF EXISTS stock_count_warehouse_id_fkey;
ALTER TABLE stock_count
  ADD CONSTRAINT fk_stock_count_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);

ALTER TABLE stock_count_line DROP CONSTRAINT IF EXISTS stock_count_line_count_id_fkey;
ALTER TABLE stock_count_line
  ADD CONSTRAINT fk_stock_count_line_count_tenant
  FOREIGN KEY (tenant_id, count_id) REFERENCES stock_count (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE stock_count_line DROP CONSTRAINT IF EXISTS stock_count_line_product_id_fkey;
ALTER TABLE stock_count_line
  ADD CONSTRAINT fk_stock_count_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);

ALTER TABLE stock_adjustment DROP CONSTRAINT IF EXISTS stock_adjustment_warehouse_id_fkey;
ALTER TABLE stock_adjustment
  ADD CONSTRAINT fk_stock_adjustment_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);

ALTER TABLE stock_adjustment DROP CONSTRAINT IF EXISTS stock_adjustment_source_count_id_fkey;
ALTER TABLE stock_adjustment
  ADD CONSTRAINT fk_stock_adjustment_source_count_tenant
  FOREIGN KEY (tenant_id, source_count_id) REFERENCES stock_count (tenant_id, id);

ALTER TABLE stock_adjustment_line DROP CONSTRAINT IF EXISTS stock_adjustment_line_adjustment_id_fkey;
ALTER TABLE stock_adjustment_line
  ADD CONSTRAINT fk_stock_adjustment_line_adjustment_tenant
  FOREIGN KEY (tenant_id, adjustment_id) REFERENCES stock_adjustment (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE stock_adjustment_line DROP CONSTRAINT IF EXISTS stock_adjustment_line_product_id_fkey;
ALTER TABLE stock_adjustment_line
  ADD CONSTRAINT fk_stock_adjustment_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);

ALTER TABLE transfer DROP CONSTRAINT IF EXISTS transfer_from_warehouse_id_fkey;
ALTER TABLE transfer
  ADD CONSTRAINT fk_transfer_from_warehouse_tenant
  FOREIGN KEY (tenant_id, from_warehouse_id) REFERENCES warehouse (tenant_id, id);

ALTER TABLE transfer DROP CONSTRAINT IF EXISTS transfer_to_warehouse_id_fkey;
ALTER TABLE transfer
  ADD CONSTRAINT fk_transfer_to_warehouse_tenant
  FOREIGN KEY (tenant_id, to_warehouse_id) REFERENCES warehouse (tenant_id, id);

ALTER TABLE transfer_line DROP CONSTRAINT IF EXISTS transfer_line_transfer_id_fkey;
ALTER TABLE transfer_line
  ADD CONSTRAINT fk_transfer_line_transfer_tenant
  FOREIGN KEY (tenant_id, transfer_id) REFERENCES transfer (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE transfer_line DROP CONSTRAINT IF EXISTS transfer_line_product_id_fkey;
ALTER TABLE transfer_line
  ADD CONSTRAINT fk_transfer_line_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);

ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_warehouse_id_fkey;
ALTER TABLE stock_movement
  ADD CONSTRAINT fk_stock_movement_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);

ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_product_id_fkey;
ALTER TABLE stock_movement
  ADD CONSTRAINT fk_stock_movement_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);

ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_unit_id_fkey;
ALTER TABLE stock_movement
  ADD CONSTRAINT fk_stock_movement_unit_tenant
  FOREIGN KEY (tenant_id, unit_id) REFERENCES unit (tenant_id, id);

ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_transfer_id_fkey;
ALTER TABLE stock_movement
  ADD CONSTRAINT fk_stock_movement_transfer_tenant
  FOREIGN KEY (tenant_id, transfer_id) REFERENCES transfer (tenant_id, id);

ALTER TABLE stock_movement DROP CONSTRAINT IF EXISTS stock_movement_reversal_of_fkey;
ALTER TABLE stock_movement
  ADD CONSTRAINT fk_stock_movement_reversal_of_tenant
  FOREIGN KEY (tenant_id, reversal_of) REFERENCES stock_movement (tenant_id, id);

ALTER TABLE stock_balance DROP CONSTRAINT IF EXISTS stock_balance_warehouse_id_fkey;
ALTER TABLE stock_balance
  ADD CONSTRAINT fk_stock_balance_warehouse_tenant
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse (tenant_id, id);

ALTER TABLE stock_balance DROP CONSTRAINT IF EXISTS stock_balance_product_id_fkey;
ALTER TABLE stock_balance
  ADD CONSTRAINT fk_stock_balance_product_tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id);
