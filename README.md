# iDepot

Next-generation modernization of the legacy iDepot depot/POS/inventory/accounting platform.

## Modernization starting point

This repository is being rebuilt from a production legacy CodeIgniter/PHP/MySQL application used by existing clients. The rebuild must preserve verified business rules while correcting calculation, data-integrity, security and UX problems.

Start with [`ZAI_IDEPOT_MODERNIZATION_MASTER_PROMPT.md`](./ZAI_IDEPOT_MODERNIZATION_MASTER_PROMPT.md).

Legacy reverse-engineering inputs live under `legacy/`. They are sanitized public references only and **must not be deployed**.

Planned target architecture:

- Next.js web portal
- NestJS core API
- PostgreSQL authoritative database
- Tauri 2 Windows/macOS desktop application with POS hardware bridge
- React Native/Expo iOS and Android applications
- Python/FastAPI AI service
- SQLite/IndexedDB offline-first clients with deterministic synchronization

The repository must never contain production client PII or secrets.

## Phase 0 — forensic audit (complete)

The verified business-rule map and migration baseline live under [`docs/`](./docs/):

- [`docs/legacy-audit/`](./docs/legacy-audit/) — 20 evidence-cited documents: module inventory, view classification, controller/model/table cross-references, lifecycle maps (sales/POS, purchasing, stock, payments, AR/AP, returns, units, numbering), business-rules catalogue, calculation register with corrected rules, defects & risks, dead/school-code register.
- [`docs/architecture/`](./docs/architecture/) — target system context, monorepo architecture, domain model, offline-sync design, POS hardware abstraction, mobile apps, AI opportunity map, security & RBAC design.
- [`docs/migration/`](./docs/migration/) — legacy MySQL → PostgreSQL mapping and the client migration & reconciliation strategy.
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) and [`docs/STATUS.md`](./docs/STATUS.md) — phased implementation plan and living status board.

Start with [`docs/legacy-audit/README.md`](./docs/legacy-audit/README.md) for the audit's headline findings.
