# ADR-0003 — Multi-tenancy & Row Level Security implementation

- **Status:** Accepted (Phase 1)
- **Date:** 2026-10-26
- **Deciders:** Phase 1 engineering
- **Scope:** The LOCKED shared-schema cloud topology (target-architecture.md §6) and its on-premise deployment mode.

## Context

Tenancy is LOCKED: cloud = one shared PostgreSQL cluster, `tenant_id` on every
tenant-owned row, repo isolation + RLS as defense-in-depth. The application role must be
structurally unable to read or write across tenants, including under application bugs.
Phase 1 exit criteria require cross-tenant access **impossibility** tests.

## Decision

1. **Shared schema, `tenant_id` everywhere.** Every tenant-owned table carries
   `tenant_id uuid NOT NULL REFERENCES tenant(id)`. Phase 1 tables: `branch`, `warehouse`,
   `app_user`, `device`, `sample_document`, `audit_event`, `outbox_event`.
2. **RLS as defense-in-depth (not the primary guard).** Application code filters by tenant
   from the verified JWT context; RLS is the second wall that turns a forgotten predicate
   into a 0-row result instead of a data leak.
3. **Session context is transaction-scoped.** `SET LOCAL app.tenant_id = '<uuid>'` (via
   `set_config(..., true)`) is issued by the UnitOfWork opener (ADR-0001) — never
   session-global, never `set_config(..., false)`. Policies read
   `current_setting('app.tenant_id', true)`, so a **missing context yields zero rows**
   (fail-closed), and `SET LOCAL` guarantees the context dies with the transaction.
4. **Role separation.**
   - `idepot_app` (runtime): subject to RLS on every table; granted SELECT/INSERT/UPDATE/
     DELETE only; **no** TRUNCATE/CREATE/REFERENCES; cannot create schemas.
   - Admin/owner role (migrations, ops): owner-bypasses RLS to bootstrap schema and seed;
     never used by the application at runtime.
   - The runtime stager of the migration engine runs with an admin connection but owns no
     product schema; `legacy_raw` is created by the DDL layer only (0002 migration) and the
     stager fails fast if it is absent.
5. **RLS policies.** One policy per table:
   `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` — for `tenant` itself
   `USING (id = ...)`. `WITH CHECK` is implied by the `USING` expression for writes.
   `FORCE ROW LEVEL SECURITY` is deliberately **not** used so the owner can bootstrap;
   the app role is never an owner, which is asserted by tests.
6. **Tenant-scoped uniqueness.** Natural keys are unique per tenant
   (`UNIQUE (tenant_id, code)` on `warehouse`, `branch`, `sample_document`,
   `UNIQUE (tenant_id, email)` on `app_user`, `UNIQUE (tenant_id, device_code)` on
   `device`) — never globally unique on business codes.
7. **Identity sources of truth.** `tenantId` enters the application only from the verified
   JWT (login binds user→tenant). Request bodies can never override it. Audit and outbox
   rows take `tenant_id` from the same UoW context as the business writes.
8. **On-premise mode.** Same schema, same code path; deployment provisions exactly one
   `tenant` row and the application is configured with that tenant. No second domain model
   and no separate migration format (Phase 0 decision retained).

## Verification (Phase 1 tests)

- `migrations.integration.test`: app role sees 0 rows without context, 1 row with correct
  `SET LOCAL`; TRUNCATE and CREATE TABLE are denied.
- `rbac-matrix.integration.test` / `vertical-slice.e2e.integration.test`: tenant B tokens
  cannot read or mutate tenant A resources (404 semantics), regardless of role.
- `posting-coordinator.integration.test`: UoW sets tenant context for the whole posting set;
  rollback leaves zero rows.

## Consequences

- A bug in application-level filtering degrades to "row not found", not a cross-tenant leak.
- Every new tenant-owned table MUST: carry `tenant_id`, enable RLS, add the policy, and be
  added to the RBAC/RLS test matrices — enforced by PR checklist and by
  `rls-coverage` assertions in the matrix test (tables list is asserted, not assumed).
- Connection pooling is safe: transaction-scoped context cannot leak across requests.
