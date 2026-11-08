# iDepot Legacy Intake — Sanitized Technical Findings

**Basis:** user-provided `depot.zip` and `depot.sql` inspected locally. This document intentionally includes no client transaction data, credentials, passwords, log excerpts or PII.

## File integrity & coverage

- PHP archive SHA-256: `9b3c29d3db639d1142f4e2d744769fd2eb623c60ad9ef85c30568164988f353a`.
- SQL file SHA-256: `83b2b9ea002d846ef670797d67ae49c18b813e35e69c952478e989b49af6fbd4`.
- Archive entries: **1,081**, with total uncompressed size **25,796,477 bytes**.
- Business PHP pages under `v_l02i/backend/admin/pages/`: **266**. These are files, not 266 confirmed active screens.
- `controllers/Admin.php` contains about **166 PHP function declarations**; other controllers/models also exist.
- `logs/` includes **333 application log files**. Do not upload this archive to public GitHub.
- Archive path-traversal entries: **0**; symbolic-link entries: **0**.
- This ZIP primarily represents the legacy CodeIgniter application directory, not a verified full runnable website bundle; a standalone CI framework system folder and all external assets are not established here.

## PHP business pages by primary directory

| Page family | Count |
|---|---:|
| `sales` | 83 |
| `pos` | 43 |
| `_root_pages` | 35 |
| `reports` | 34 |
| `purchases` | 28 |
| `dates_selection` | 15 |
| `pos-old` | 11 |
| `items_transfers` | 7 |
| `journal` | 6 |
| `banking` | 4 |

The archive also includes top-level school-era PHP views. These must be separated from genuinely active depot screens using the controller-to-view mapping. Never port all files indiscriminately.

## Database

- MariaDB/MySQL schema includes **66 CREATE TABLE statements**.
- The uploaded `depot.sql` contains **0 INSERT statements** and **0 REPLACE statements**, so it does **not contain client rows**.
- Database tables cover sales/orders/payments, inventory and unit conversions, customers/suppliers, AP/AR, journals, document numbering, banks, returns/credit, administration and legacy dormant modules.
- Key migration risks: floating-point `double` money columns, longtext date/quantity fields, duplicated invoice/payment balances, non-normalized document codes, absent core transactional foreign keys, historical mismatch between quantities and stock counts, and dead/unused returns/loyalty schemas.
- `sales_returns`, `refund_transactions`, `store_credits`, `customer_loyalty` etc. are schema definitions **not evidence of historical rows or working features**.

## Security

- `config/database.php` includes database-connection configuration fields. Their values have **not** been copied into this report.
- The legacy archive includes application logs. Treat it as confidential. Review/rotate any live credentials or tokens within authorized infrastructure.
- Do not place raw ZIP/SQL/logs/connection strings or a live customer dump in the GitHub repository or public staging.
- The separately identified legacy website document root contains SQL/ZIP backups reachable with HTTP 200 to HEAD requests; restrict HTTP access and relocate backups out of web root after safe verification, while preserving production availability.

## Required acceptance gates

1. Reconcile all 266 PHP page filenames with existing `docs/legacy-audit/view-classification.md` and controller load paths: Active, Dead, Duplicate, Broken, School-only. Confirm every **active depot workflow** has a mapped Next.js page/API/test; feature parity need not replicate PHP markup.
2. Map each active business calculation and authorization path to current NestJS domain tests. Preserve and enhance workflows while fixing audited legacy defects.
3. Obtain a **full authorized client-data export** (not schema-only), preferably a sanitized read-only representative backup for development, with documented source row counts/checksums.
4. Rehearse MySQL → staging PostgreSQL migration, including invoices, multi-tender payments, deposits, opening balances, stock and unit conversions, returns evidence, AR/AP, GL, and historical document codes.
5. Produce source→target ID maps, correction-aware reconciliation, approval/quarantine queues, accounting statement tie-outs, rerun idempotency, rollback and UAT evidence before considering production cutover.
6. Deploy merged new iDepot into its own protected staging directory, database and HTTPS domain with synthetic data, without changing the legacy production site.

## Related project tracking

- `https://github.com/christianagbotah/idepot/issues/9` — legacy parity and client-data migration acceptance.
- `https://github.com/christianagbotah/idepot/issues/10` — staging deployment.
- `https://github.com/christianagbotah/idepot/pull/8` — Phase 5 draft implementation.

**Bottom line:** the files establish a strong source-code and schema basis, but they do not yet establish 100% legacy UI parity or prove real-client data migratability.