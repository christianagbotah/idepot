# iDepot — z.ai Phase 6 Master Handoff (2026-11-12)

## Mission and exact starting point

Act as principal engineer for **iDepot Next Generation**, with a test-first, enterprise-grade remit. **Phase 5 PR #8 is merged** into the protected `main` branch: SHA `776d2ebffd7e3ec8ec982a26c51439ca5a0a6dd2`. Last exact-head pre-merge CI run `43270567456` passed security, **146 unit + 397 PostgreSQL integration tests**, migrations/fixture MySQL smoke and reconciliation artifacts. Re-fetch `main` and all open PRs at the start; NEVER reset to old Phase 5 commits or recreate delivered returns/refunds/reporting/admin functionality.

This assignment has **two coordinated tracks**:

**A. Release-candidate staging and owner UAT, highest operational priority.**
Prepare everything needed to deploy the **MERGED main** safely to an isolated test website, close test-blocking issues, and hand over exact scripts/artifacts to the connected VPS administrator.

**B. Roadmap Phase 6 — desktop, mobile, offline stress, hardware, printing and device migration**, on a fresh feature branch and draft PR after base-line verification. Work can progress in parallel with staging preparation; do not claim UAT approval or production readiness before the owner tests staging.

Read BEFORE coding:
- `docs/ROADMAP.md` — Phase 6 scope, acceptance criteria, immutable posting/migration rules.
- `docs/STATUS.md` — substantial earlier work; note the Phase 5 pre-merge heading is now stale and must be updated as part of this assignment.
- `docs/staging/staging-runbook.md`, issue [#10](https://github.com/christianagbotah/idepot/issues/10).
- `docs/parity/legacy-view-matrix.csv`, `docs/parity/business-rule-parity.md`, `docs/parity/uat-checklist.md`, issue [#9](https://github.com/christianagbotah/idepot/issues/9).
- `docs/architecture/target-architecture.md`, `docs/architecture/offline-sync.md` (locate real path; do not invent), ADRs for posting coordinator, PostgreSQL/RLS/tenancy and cost basis.
- `legacy/intake/2026-11-06/README.md` (provenance). The legacy ZIP/source and 66-table schema reference are not a full-data client backup.
- Existing `apps/web` and `apps/api`, `packages/domain`, `packages/contracts`, `packages/migration`, `infra/migrations`.

## Track A — deployment readiness and safe staging

**Live infrastructure facts from 2026-11-12, read-only owner-authorized preflight:**
- VPS: `vps.lightworldtech.com` (Webuzo Nginx, PM2, PostgreSQL; other businesses are hosted on same node).
- Disk: **313GB / 279GB used / only ~32GB free (90% used)**. RAM ~7GiB available; **3GiB swap all used**.
- No current `/home/lightworld/webapps/idepot-staging` directory, iDepot PM2 processes, staging DNS resolution or iDepot vhost at last check; sample loopback ports 4310/4311 were free at last check.
- Existing PHP legacy client `/home/lightworld/webapps/depot1` is LIVE, not to be touched; all other projects likewise.
- z.ai sandbox has **no VPS credentials**. **DO NOT ask for secrets, put credentials in Git, fabricate remote access, or claim the domain was deployed.** The owner's separate authorized ChatGPT/Remote Desktop Commander path can handle VPS work if supplied with clear artifacts.

Work A1: Update the `docs/staging/staging-runbook.md` preflight to include the 90% disk and exhausted swap warning. Produce read-only disk analysis commands to identify obsolete **unreferenced** release directories, caches and rotated logs; do not automatically delete customer data, production DB backups, uploaded media, active PM2 releases or other clients' files. Prior to server-side build/large DB restore, establish safe free-space and swap headroom and record evidence. Build assets off-VPS when possible.

Work A2: Create repeatable, version-pinned release packaging from clean `main`: Next.js production bundle, NestJS build, locked dependencies, checksums/provenance, `npm ci`/CI exact-head tests; validate Node/PM2 compatibility. Provide idempotent `scripts/deploy/staging-preflight.sh`, `scripts/deploy/staging-deploy.sh`, `scripts/deploy/staging-smoke.sh`, `scripts/deploy/staging-rollback.sh` (or equivalent) with **dry-run by default** or explicit operator execution. Use `releases/<SHA>/` and atomically switch `current` symlink after health pass; no `git reset --hard` on production, no destructive `rm -rf` of active releases. Never silently mutate Webuzo's managed vhost config. If DNS not delegated, document concrete needed DNS A/AAAA setup, do not improvise a public URL.

Work A3: Deploy **only via an authorized deploy channel** to `/home/lightworld/webapps/idepot-staging`, separate PostgreSQL role/DB, loopback-only API/web ports, Webuzo-compatible reverse proxy and HTTPS. Secrets in chmod 600 external env files, not copied to Git or logs; backups and restore checks. Seed synthetic tenant with admin, accountant, manager, cashier, auditor. Do not create public default passwords; provision test credentials securely and rotate. Make GET `/api/health` respond with deployed SHA and DB readiness (without secrets); PM2 health/restarts and restricted access. Validate original depot1 HTTP health and files before/after without impacting its DB.

Work A4: End-to-end synthetic UAT of every active menu route and critical workflows: login/RBAC, product/price lists/units, stock+transfer, cash/credit POS+split tender/offline retry, invoice/receipt, quotation print (if implemented), purchase/GRN/AP, bank/journal/TB/P&L/BS/CF, returns+tax+store credit+refund/exchange, as-of reports, users and settings, audit. Record API response, screenshots, exact math and failures in `docs/staging/UAT-EVIDENCE.md` and #10; a static frontend/successful build is **not** a passing UAT. Do not approve cutover; staging only.

## Track B — Phase 6 desktop/mobile/hardware

**Create a fresh branch:** `phase-6/desktop-mobile-hardware` from current merged `main`. Do not overwrite the Stage A release branch or alter past migrations 0001–0020. Open a **draft** PR promptly and commit small reviewed checkpoints. Keep the repo's Next.js + NestJS + PostgreSQL core; share types/contracts and server-side business rules with desktop/mobile. `apps/` currently contains only `api` and `web` — do not assume a Tauri or React Native application already exists.

B1 — **Tauri 2 desktop (Windows/macOS).** Build native shell of the existing POS & inventory/web app, not a fake mock: secure token/device session handling, safe API base URL and certificates, proxy compatibility, update channel/signature strategy, native local SQLite offline queue where appropriate, online/offline status, conflict/error UI, installer target(s) MSI/NSIS and DMG when builders/runners support them. Document Windows/macOS prerequisites and CI verification; never claim successful Windows/macOS installer without actual corresponding host runner/signing/testing. Avoid recurring third-party paid dependency unless explicitly justified.

B2 — **React Native iOS/Android** app with shared domain/API contracts, login/device pairing, role-aware dashboard, product lookup/barcode camera entry, stock/stocktaking, mobile POS if permitted, sync/conflict management and readable responsive UI. Use secure OS keychain/keystore storage; no hardcoded backend URLs/secrets. Test Android/iOS builds where runners exist and state platform limitations honestly.

B3 — **Offline-first correctness.** Local durable SQLite replica/outbox, transactional event capture, download bootstrap, idempotent sync-push and resumable sync-pull using existing POST `/api/sync/push`, GET `/api/sync/pull`; do NOT implement a second posting engine. Server remains authoritative on stock balance, tax, money, prices, allocations and sequences. Preserve the same idempotency identities through retries/restarts and duplicate deliveries. Server conflict results must show a human-resolvable queue; don't silently drop sales. Design tests for airplane-mode, app kill/crash, 2-device concurrent sale, stale pricing/conversion, offline booklet leases, revoked permissions, token expiry/refresh, split tenders and partial network failure.

B4 — **Hardware adapter framework + test screens.** USB/Bluetooth keyboard-style barcode scanner, label printer, thermal ESC/POS printers 58/80mm, A4 invoices, cash drawer pulses, optional scales where appropriate, per-device configuration by tenant/branch, browser fallback; keep each adapter pluggable and allow simulation without physical device. Test print alignment, character sets, QR/barcode, Ghana cedi **₵**, MoMo details, change/due and multi-page layouts. No unconditional cash drawer kicks on failed or duplicate sales.

B5 — **Printing template gallery.** Render shared canonical financial documents: POS receipts, invoices, proforma quotation/A4, waybills, shelf/product labels, credit notes, customer/supplier statements. Exact data must come from API evidence, not recomputed differently per client. 2dp display for currencies with thousands separators in UI, retain 4dp internal exact accounting. Preview, branch logo and permitted settings, printer test/copy. Fix legacy active-view gaps (especially quotation print, price-list UX, global search) in separate scoped PRs or as explicit Phase 6 child tasks with test proof. SMS/loyalty remain demand/feature gated and require consent/provider settings.

B6 — **50-terminal offline chaos simulation** including concurrent writes, network partitions, resend storms, long disconnect, rollback after partial local sync, isolation between tenants/branches, duplicate booklet codes and idempotent release of reserved ranges. Log deterministic seeds, memory/CPU latency, p95/p99, conflict rates and reconciliation. Do not treat unit tests as physical hardware sign-off.

## Migration and security requirements, continuous

Migration is **not** completed by the existing schema-only `depot.sql`; it contains no client rows. Preserve immutable migration scripts and `legacy_raw` quarantine. Phase 6 must add device migration/re-pairing and local replica bootstrap from migrated records, legacy-device credentials rotation and safety for read-only legacy cutover. An authorized sanitized FULL-DATA dry-run and owner/accountant sign-off remain #9, and production cutover is **Phase 8** only.

Financial commands from desktop and mobile MUST call the **same server-side Posting Coordinator / UnitOfWork** as the web; never move authoritative business posting to background sync consumers. Maintain RLS/permissions, revocation handling, audit and transactional outbox; no passwords/PII dumped in logs, telemetry or screenshots. Do not touch live `depot1` or interfere with other co-hosted Lightworld services.

## Engineering quality and reporting

- Baseline before changes: independently reproduce `main` verification, **146 unit + 397 integration** on exact merged code, migrations from zero + idempotency, MySQL fixture smoke, security, build/typecheck. If post-merge run differs, describe it, don't falsify counts.
- Preserve and extend all existing tests. Include API and desktop/mobile interaction/adapter test suites and security/tenant matrix; add CI jobs gated by actual runner availability.
- Keep source/runner reproducible and documentation portable (no `/home/z/...` hardcoding).
- Update `docs/ROADMAP.md` only for approved scope or explicit deviations; update `docs/STATUS.md` to correctly state Phase 5 **merged** and Phase 6 in progress; keep #9, #10 and new Phase 6 PR current.
- Do not merge Phase 6 automatically and do not claim deployments, installers, store submissions or hardware support without verified evidence.

**End-of-run deliverables:** exact main SHA and new branch HEAD, PR link, stages A1–A4 with evidence/operational blockers and staging HTTPS URL ONLY IF ACTUALLY VERIFIED, tests/build artifacts by platform, supported physical hardware matrix, offline stress results, unresolved parity gaps, migration scope and risks, deploy/rollback artifacts and next acceptance steps. Push regularly through authorized GitHub access; if unavailable in your sandbox, package `.patch`/`.bundle` as user-downloadable artifacts and report that the branch was NOT pushed (never request credentials).

Begin with staging preflight/artifact preparation and Phase 6 architecture branch foundation. **Do not await an explicit 'go on' for ordinary engineering steps.**
