/** Shared benchmark DDL (applied via the control path; candidates also prove B4 with their own facility). */
export const BENCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bench_a (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  code text NOT NULL,
  amount numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS bench_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  entry_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('dr','cr')),
  amount numeric(18,4) NOT NULL
);
CREATE TABLE IF NOT EXISTS bench_rls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  payload text NOT NULL
);
ALTER TABLE bench_rls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON bench_rls;
CREATE POLICY tenant_isolation ON bench_rls
  USING (tenant_id = current_setting('app.tenant_id', true));
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO idepot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON bench_a, bench_ledger, bench_rls TO idepot_app;
`;
