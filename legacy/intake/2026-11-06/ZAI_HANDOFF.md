# z.ai — iDepot Legacy Parity, Client-Migration Readiness and Staging Handoff

## Objective

Continue iDepot's Next.js + NestJS + PostgreSQL modernization. The owner **retains this stack**, but demands that every **genuinely active depot business view/workflow and business rule** from CodeIgniter be preserved and enhanced. Do not rebuild the legacy PHP as CodeIgniter 4. Do not copy dead, duplicate, defective, unsafe or school-only pages merely because they exist.

Work autonomously from the latest GitHub state; do not overwrite existing progress. Preserve Phase 0–4, and keep the active Phase 5 PR independent and unmerged until the holistic final review.

## Mandatory source paths (read these first)

These materials are **already committed to GitHub**:

1. `legacy/intake/2026-11-06/README.md` — provenance and security constraints.
2. `legacy/intake/2026-11-06/idepot_legacy_intake_report.md` — audit observations and migration release gates.
3. `legacy/intake/2026-11-06/idepot_legacy_view_inventory.csv` — **266 PHP business-page paths**, requiring activity classification and target route/test mapping.
4. `legacy/intake/2026-11-06/idepot_legacy_schema_inventory.csv` — **66 legacy table names**, all without client data in the uploaded dump.
5. `legacy/intake/2026-11-06/depot_schema_only_sanitized.sql` — newly submitted 66-table MariaDB schema-only DDL, with identifying database and host redacted.
6. `legacy/source/` — **previously committed sanitized CodeIgniter source** (controllers, models, helpers, nested depot views). This comes from an earlier source upload: compare with available evidence; do not claim it is byte-identical to the owner's newer `depot.zip`.
7. `legacy/schema/legacy_mysql_schema.sql` — earlier sanitized SQL schema; **compare** with the new `depot_schema_only_sanitized.sql` for drift.
8. `docs/legacy-audit/view-classification.md`, `controller-model-map.md`, `business-rules.md`, `calculation-register.md`, `defects-and-risks.md`, `reports-kpi-inventory.md`, `returns-refund-credit.md`.
9. `docs/migration/legacy-to-postgres-map.md`, `migration-reconciliation-strategy.md`, `docs/ROADMAP.md`, `ZAI_IDEPOT_MODERNIZATION_MASTER_PROMPT.md`.

Read from the actual GitHub repo `christianagbotah/idepot`, not ephemeral sandbox copies. Fetch all latest refs before any edits.

## Task A — Exhaustive functional parity with proof

Use the 266-row CSV as the universe of inspected business-page files; **266 files are not 266 active workflows**. For each view establish its original controller method, URL/navigation, user role, forms, actions, calculations, print/export, model and DB dependencies and activity status. Distinguish active, active-but-broken, duplicate, dead, school-only and uncertain. Every active depot capability must map to a real Next.js route/NestJS API, an automated test and a UAT scenario. Include POS, quotations, sales, invoices, payments/receipts, deposits, dispatch/waybill, stock, units/conversions, suppliers/PO/GRN/AP, banking/journals, stock/backlog/margin reports and settings/users, plus Phase 5 returns/refunds/store credit.

Write `docs/parity/legacy-view-matrix.csv`, `docs/parity/business-rule-parity.md`, `docs/parity/uat-checklist.md`. Every row must have evidential source path, target implementation and truthful status. Do not infer completeness from UI existence alone. Implement or document gaps, without breaking active releases.

## Task B — 66-table schema mapping and migration-readiness

Compare the new 2026-11-06 DDL with the older reference schema, list column/index/constraint drift, and map source tables and relevant columns to the modern PostgreSQL aggregate/migration transform. Distinguish live, historical-reference-only, dead/unused and ambiguous tables. Review money `DOUBLE`, text-encoded dates/quantities, duplicated invoice/payment balances, stock snapshots, historical document numbering, return/loyalty dead-DDL, and mixed school leftovers.

The uploaded `depot.sql` has **zero INSERT/REPLACE data records**. Do NOT claim a real customer/stock/AR/AP/payment migration is verified using this schema-only dump. Build and test schema transforms on sanitized synthetic fixtures; for a real-client rehearsal obtain a separately authorized, sanitized full-data copy and isolated staging consent. Test counts/checksums, source→target IDs, dated journals, stock quantity+value, cash/AR/AP/opening trial balance, correction-aware reconciliation, quarantine and user/accountant sign-off. Avoid silently forcing mismatches or inventing returns. Keep published migrations immutable; additive migrations only.

## Task C — Staging for user-visible testing

Use **merged `main`**, not the unreviewed Phase 5 draft, for first deployment. Target `idepot-staging.lightworldtech.com` and `/home/lightworld/webapps/idepot-staging` only after validating DNS control, VPS ports, disk/RAM/swap capacity, Webuzo Nginx/TLS and existing services. Stage with a separate PostgreSQL database/user and synthetic demo tenant/users, correct permissions, secure secrets outside Git, HTTPS, PM2/systemd health checks and rollback. Do not touch the legacy client under `/home/lightworld/webapps/depot1`, its database or production vhost. Verify every primary menu route and API against real synthetic records. Only claim staging live after independent HTTPS login and business-smoke tests pass.

## Task D — Continue Phase 5 safely

Active PR #8: `https://github.com/christianagbotah/idepot/pull/8`, branch `phase-5/returns-reporting-admin`. Recheck its latest HEAD; continue its existing work, rather than starting over. Do not merge Phase 5 automatically, and do not start Phase 6. New docs/parity/migration work should be on appropriately scoped branches/PRs without accidentally overwriting PR #8. Close tasks only with proof.

## Safety and release gates

- **Do not** commit the original `depot.zip`, `depot.sql`, production dumps, credential configs, app logs or client PII to this **public** GitHub repo.
- The repository's `legacy/source/` is sanitized historical evidence, not something to deploy.
- Do not mutate production or publicly expose a source SQL/ZIP backup.
- Preserve exact decimal-financial and posting-coordinator atomicity invariants.
- Keep a structured exceptions list for unresolved active flows and legacy-data issues.

Track #9 (legacy parity/migration) and #10 (staging) continuously. Update CI, docs and PRs with truthful evidence.

## Final handoff required

Return exact branch/commit/PR refs; coverage by active/dead/duplicate/uncertain, missing view/workflow items; 66-table mapping/diff status; synthetic vs real client migration evidence distinguished; count of approved/unapproved corrections; test and CI details; staging domain+directory+SHA+PM2 health+HTTPS+demo access method or explicit blocker. Do not claim full legacy parity, real-client migration or a live staging domain without verification.
