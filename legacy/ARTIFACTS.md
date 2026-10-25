# Legacy artifact handoff

The original deployed `idepot.zip` and legacy SQL dumps are **not safe to publish** in this public repository because they contain production-style configuration and client/staff data.

The repository now contains the sanitized legacy evidence directly:

- `legacy/source/` — 416 retained source files from the deployed iDepot application, including controllers, models, helpers, libraries, active nested depot/business views, navigation and selected custom UI assets. Secret-bearing production config, uploads, dependency noise and the old top-level school-management view collection are excluded.
- `legacy/schema/legacy_mysql_schema.sql` — schema-only DDL extracted from the deployed legacy SQL dump. No INSERT/data rows are included. The dump may still contain obsolete school-management tables; z.ai must classify tables by active iDepot code usage.
- `legacy/legacy-view-inventory.md` — guidance for distinguishing depot/business views from school-era leftovers.
- `/ZAI_IDEPOT_MODERNIZATION_MASTER_PROMPT.md` — the implementation brief for the rebuild.

Do not substitute the unsanitized archive or full production database dumps in this public repository.
