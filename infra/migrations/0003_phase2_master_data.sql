-- ============================================================
-- 0003_phase2_master_data.sql — Phase 2: catalog, parties, pricing
-- + legacy_raw staging tables for the Phase 2 migration workstream.
--
-- Conventions locked by 0001/0002: uuid PKs, tenant_id FK with RLS
-- tenant_isolation policy, tenant-scoped business uniques, least-privilege
-- grants to idepot_app. Quantities numeric(18,6), money numeric(18,4)
-- (map doc §5 type rules). All arithmetic on these columns happens in
-- exact scaled-integer decimal space in the application (never float).
-- ============================================================

-- ------------------------------------------------------------
-- legacy_raw staging extensions (DDL layer owns legacy_raw; the
-- runtime stager only assumes these exist).
-- ------------------------------------------------------------
ALTER TABLE legacy_raw.item ADD COLUMN IF NOT EXISTS category_id text;
ALTER TABLE legacy_raw.item ADD COLUMN IF NOT EXISTS supplier_id text;
ALTER TABLE legacy_raw.item ADD COLUMN IF NOT EXISTS selling_price text;
ALTER TABLE legacy_raw.item ADD COLUMN IF NOT EXISTS purchase_price text;
ALTER TABLE legacy_raw.item ADD COLUMN IF NOT EXISTS unit_quantity text;
ALTER TABLE legacy_raw.item ADD COLUMN IF NOT EXISTS barcode text;

CREATE TABLE IF NOT EXISTS legacy_raw.item_main_category (
  category_id text, category_name text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.item_category (
  category_id text, main_id text, category_name text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.units (
  unit_id text, unit_name text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.units_items (
  id text, unit_id text, item_id text, unit_total text, unit_price text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.customers (
  customer_id text, customer_name text, contact_person text,
  mobile text, phone text, email text, customer_active text, guest text,
  address text, created_date text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_raw.suppliers (
  supplier_id text, supplier_name text, contact_person text,
  mobile text, phone text, email text, address text, created_date text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

-- Synthetic capture of the client's pre-cutover physical count sheet
-- (strategy doc §4 count-first authority). Not a real legacy table —
-- it represents the count document the client produces during parallel run.
CREATE TABLE IF NOT EXISTS legacy_raw.opening_stock_count (
  id text, item_id text, store_id text,
  counted_quantity text, counted_by text, counted_date text,
  _src_row_number bigint,
  _loaded_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Parties (phone-first identity: phone NOT NULL, email optional)
-- Created before `product` (products carry a nullable supplier FK).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  contact_person text,
  phone text NOT NULL,
  alt_phone text,
  email text,
  address text,
  is_guest boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  contact_person text,
  phone text NOT NULL,
  alt_phone text,
  email text,
  address text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- ------------------------------------------------------------
-- Catalog: units, categories, brands, products, conversions, barcodes
-- ------------------------------------------------------------

-- required for the effective-dating exclusion constraint on price_list_item
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS brand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS product_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  parent_id uuid REFERENCES product_category(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES product_category(id),
  supplier_id uuid REFERENCES supplier(id),
  brand_id uuid REFERENCES brand(id),
  base_unit_id uuid NOT NULL REFERENCES unit(id),
  default_sale_unit_id uuid REFERENCES unit(id),
  sold_in_units boolean NOT NULL DEFAULT false,
  selling_price numeric(18,4) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  purchase_price numeric(18,4) CHECK (purchase_price IS NULL OR purchase_price >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Configurable conversion: 1 of this unit == conversion_factor base units.
-- The base unit itself is product.base_unit_id (factor 1 implicit) and is
-- deliberately NOT re-declared here (enforced in the domain layer).
CREATE TABLE IF NOT EXISTS product_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES unit(id),
  conversion_factor numeric(18,6) NOT NULL CHECK (conversion_factor > 0),
  price numeric(18,4) CHECK (price IS NULL OR price >= 0),
  is_default_sale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, unit_id)
);

CREATE TABLE IF NOT EXISTS product_barcode (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_tenant_name ON product (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_product_category ON product (category_id);

-- ------------------------------------------------------------
-- Opening-balance document FOUNDATION (ROADMAP Phase 2). The AR/AP/GL
-- posting of these documents arrives with Phase 4; Phase 2 ships the
-- document, its audit trail and its coordinator participation.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS party_opening_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  party_type text NOT NULL CHECK (party_type IN ('customer','supplier')),
  party_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL,
  note text,
  source text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Effective-dated pricing (map doc: price lists keyed by
-- (list, product, unit, effective date); historical rows are immutable
-- once effective — enforced in the service layer + tested).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('standard','customer')),
  customer_id uuid REFERENCES customer(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (kind <> 'customer' OR customer_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS price_list_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  price_list_id uuid NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id),
  unit_id uuid NOT NULL REFERENCES unit(id),
  price numeric(18,4) NOT NULL CHECK (price >= 0),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- no overlapping effective windows for the same (list, product, unit)
  EXCLUDE USING gist (
    price_list_id WITH =,
    product_id WITH =,
    unit_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_price_list_item_lookup
  ON price_list_item (tenant_id, product_id, unit_id, effective_from DESC);

-- ------------------------------------------------------------
-- RLS + grants (same policy shape as 0001)
-- ------------------------------------------------------------
ALTER TABLE unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_barcode ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_opening_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_item ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['unit','brand','product_category','product','product_unit',
                           'product_barcode','customer','supplier','party_opening_balance',
                           'price_list','price_list_item']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  unit, brand, product_category, product, product_unit, product_barcode,
  customer, supplier, price_list, price_list_item
  TO idepot_app;
GRANT SELECT, INSERT, UPDATE ON party_opening_balance TO idepot_app;
