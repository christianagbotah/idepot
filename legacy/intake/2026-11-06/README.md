# Owner-supplied iDepot legacy reference intake — 2026-11-06

This folder contains **sanitized, public-repository-safe reference material** prepared from the owner's private CodeIgniter application ZIP (`depot.zip`) and MariaDB schema-only dump (`depot.sql`). The original source archives are **not** checked into GitHub. Do not confuse these references with a production-ready backup.

## Files for z.ai

| File | What it is | Interpretation |
|---|---|---|
| [idepot_legacy_intake_report.md](idepot_legacy_intake_report.md) | Initial source/schema review, risks and release gates | A technical inventory, **not** proof of functional parity |
| [idepot_legacy_view_inventory.csv](idepot_legacy_view_inventory.csv) | 266 legacy business-page filenames | All statuses start **unverified**; classifying as active requires controller/route evidence |
| [idepot_legacy_schema_inventory.csv](idepot_legacy_schema_inventory.csv) | All 66 legacy SQL table names | Schema-level coverage only; it does **not** imply rows were migrated |
| [depot_schema_only_sanitized.sql](depot_schema_only_sanitized.sql) | New 66-table MariaDB DDL reference from the uploaded `depot.sql` | **No INSERT/REPLACE data**; source host/database name redacted; not a runnable client-data migration |
| [ZAI_HANDOFF.md](ZAI_HANDOFF.md) | Exact instructions for the coding agent | Follow this along with the project master prompt |

## Existing source code already available in GitHub

- `legacy/source/`: **earlier sanitized CodeIgniter source reference** (from the previous iDepot modernization intake). Controllers, models, business views and safe UI assets are available for code-level traceability.
- `legacy/schema/legacy_mysql_schema.sql`: previous sanitized schema reference. Compare it with this newly uploaded schema rather than assuming their structures are identical.
- `docs/legacy-audit/`: forensic analysis and existing business-rule/view classifications.
- `ZAI_IDEPOT_MODERNIZATION_MASTER_PROMPT.md`, `docs/ROADMAP.md`, `docs/STATUS.md`: target architecture, phases, progress.

**Provenance caveat:** the already-published `legacy/source/` originated from an *earlier* archive; it has **not** been proven byte-for-byte identical to the newly supplied `depot.zip`. For changed source files, request an authorized **sanitized** refreshed source snapshot and do not silently assert equivalence.

## Security constraints

The original ZIP includes configuration and hundreds of application logs, and may contain secrets, user data or proprietary assets. **Do not upload it to a public repo.** The uploaded SQL is a **schema-only** export and lacks client records; it cannot prove the accuracy of customer balances, stock, payments or a real-data migration.

Full client migration rehearsal requires a separately authorized, sanitized **full-data** dump in isolated staging. Never paste credentials, production PII, logs or sensitive configuration into source control.

## Mandatory trackers

- [#9 — Legacy views/business-rule parity and migration rehearsals](https://github.com/christianagbotah/idepot/issues/9)
- [#10 — Isolated staging test deployment](https://github.com/christianagbotah/idepot/issues/10)
- [PR #8 — Phase 5 development](https://github.com/christianagbotah/idepot/pull/8)

Do not conflate a passing synthetic fixture smoke test with a real-client data reconciliation sign-off.
