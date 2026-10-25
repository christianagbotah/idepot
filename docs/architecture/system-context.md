# System Context — iDepot Next Generation

## 1. System purpose

iDepot NG is the modernization of a production depot/POS/inventory/accounting platform used by Ghanaian depots, distributors, wholesalers, retailers and building-material businesses (the legacy UI still says "CEMENTS OUT" — `get_daily_stock_report.php:124`). It must preserve the verified business rules catalogued in `docs/legacy-audit/` while fixing the accounting, stock, security and correctness defects found there.

## 2. Context diagram (C4 level 1)

```
                                   ┌──────────────────────────────────────────────┐
   Cashier (POS terminal)  ───────►│                                              │◄────── Accountant (web)
   Shop attendant          ───────►│              iDepot NG Platform              │◄────── Branch manager (web/mobile)
   Sales rep (mobile)      ───────►│                                              │◄────── Owner/Director (web/mobile)
   Warehouse officer       ───────►│  apps/web (Next.js PWA)                      │◄────── Auditor (read-only)
   Dispatch officer        ───────►│  apps/desktop (Tauri 2, Win/macOS)           │
                                   │  apps/mobile (React Native/Expo, iOS/Andr.)  │
                                   │  apps/api (NestJS modular monolith)          │◄────── Support/Implementation user
                                   │  services/ai (Python FastAPI)                │
                                   │  PostgreSQL (authoritative) / Redis (queues) │
                                   └───────┬──────────────┬───────────────┬───────┘
                                           │              │               │
                                   Hubtel SMS/Email   Payment providers  OCR/ML models
                                   (notifications)    (MoMo/bank/cheque  (AI service)
                                                      adapters)
```

**POS peripherals** attach to the Tauri desktop app via the Rust hardware bridge: barcode/QR scanners (HID/serial), ESC/POS receipt printers (USB/serial/network), cash drawers (printer kick port), label printers, optional customer display, optional scales. See [pos-hardware.md](pos-hardware.md).

## 3. Actors and their primary flows (from the legacy audit)

| Actor | Flows (legacy evidence → target) |
|---|---|
| Cashier | POS sale w/ multi-tender, hold/resume, receipt print, shift open/close, cash in/out, deposits ([sales-pos-lifecycle.md](../legacy-audit/sales-pos-lifecycle.md)) |
| Shop attendant | item tiles, unit/package sales, stock summaries (stock_manager sheets → shift sessions) |
| Sales rep | customer statement, receive payment, customer creation, order taking (mobile-first) |
| Accountant | receive/make payments, journals, TB/BS/IS/CF, reconciliation, period close ([accounting-transaction-flow.md](../legacy-audit/accounting-transaction-flow.md)) |
| Procurement officer | PO, GRN, supplier invoice, AP payment ([purchasing-lifecycle.md](../legacy-audit/purchasing-lifecycle.md)) |
| Warehouse officer | stock counts, transfers, adjustments, item history ([stock-movement-map.md](../legacy-audit/stock-movement-map.md)) |
| Branch manager | branch-scoped reports, approvals, cash variance review |
| Owner/Director | executive dashboard, KPIs, AI briefing ([ai-opportunity-map.md](ai-opportunity-map.md)) |
| Auditor | read-only access, full audit trail, export |
| Platform support | tenant access with explicit grants, health, migration tooling |

## 4. Trust boundaries and constraints

1. **Internet is unreliable** — POS must complete sales fully offline; sync later (offline-first is mandatory, master prompt §9).
2. **Multi-tenant** — single PostgreSQL cluster, tenant-isolated data (RLR/row-level scoping), branch/depot sub-scoping.
3. **Money integrity** — decimal-only arithmetic, append-only financial history, double-entry enforced, no client-computed accounting (the legacy `update_ables` pattern is explicitly banned).
4. **Ghana-first** — GHS (`₵` display, ISO `GHS`), `Africa/Accra`, phone-first customers, MoMo/bank/cheque tenders, effective-dated configurable tax (VAT/NHIL/GETFund + levies; the legacy COVID-19 levy column is dead), pre-printed booklet numbering importable.
5. **Hardware real, not mocked** — native bridges for printers/drawers/scanners; no browser-only workaround (master prompt §10).
6. **AI optional** — the transactional core must never depend on the AI service ([ai-opportunity-map.md](ai-opportunity-map.md)).

## 5. Deployment topology

- **Cloud (per environment)**: API containers (NestJS), web (Next.js), AI service (FastAPI), PostgreSQL 16+ (+ pgvector optional), Redis for queues/outbox relay, object storage for uploads/prints.
- **On-premise / client-hosted option**: docker-compose bundle (api+web+ai+postgres) for depots wanting local hosting — same images.
- **Client devices**: Windows 10/11 & macOS 12+ desktops (MSI/NSIS & DMG via Tauri bundler); Android 8+ / iOS 15+ (React Native); POS terminals (Windows-based, typically low-spec — the API must tolerate high latency and queue bursts).
- **Synchronization**: devices hold SQLite replicas scoped to the signed-in user's branch authorization; deterministic pull/push protocol ([offline-sync.md](offline-sync.md)).

## 6. Migration context

Existing clients run the legacy CodeIgniter app on a VPS with MySQL. Cutover per client: staging import → dry-run reconciliation → pilot parallel-run → freeze → delta import → cutover → post-cutover reconciliation + rollback plan (see `docs/migration/migration-reconciliation-strategy.md`). The legacy app is never modified again except for critical security hotfixes (its unauthenticated endpoints make continued exposure a risk to close quickly).
