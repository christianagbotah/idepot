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
