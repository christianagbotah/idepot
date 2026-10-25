# Security and Audit-Control Design

Fixes every finding in `docs/legacy-audit/defects-and-risks.md` §E (E1-E9) and implements master prompt §11-§12.

## 1. Authentication

| Legacy defect | Replacement |
|---|---|
| 5-char auth key, non-constant-time, shown in admin list, SMSed with plaintext password (E7) | Dropped. Email/phone + **Argon2id** password; **TOTP MFA** for privileged roles (owner, accountant, admin); recovery codes |
| No rate limiting; unauthenticated `block_account` DoS (E5) | Rate-limited login (progressive delay + IP/device throttling), lockout with signed unlock flow, no unauthenticated account mutation |
| `sha1` overwrites from dead Mobile API (E3) | Controller removed; single auth path |
| No session regeneration; `check_session` unauthenticated (E9) | Session IDs regenerated on privilege change; rotating refresh tokens with device binding; revocation UI |

Short-lived access tokens (JWT, 10-15 min) + rotating refresh (httpOnly secure cookie web / keystore mobile). Device registry per user with "sign out other devices". POS terminals support long-lived device sessions with PIN re-auth for sensitive actions (master prompt §11) — identity always preserved in audit.

## 2. Authorization (RBAC + scopes)

- Granular permission catalog (seeded, extensible): `sales.view/create/discount/void/approve`, `invoice.issue/reprint`, `payment.receive/refund/allocate/void`, `inventory.view/adjust/transfer/approve`, `purchase.create/approve/receive/pay`, `banking.view/reconcile/transfer`, `accounting.post/reverse/close_period`, `customer.credit_limit.manage`, `reports.financial.view/export`, `users.manage/roles.manage`, `settings.manage/integrations.manage`, `ai.insights.view/ai.actions.approve`, `migration.run` etc.
- Tenant-composable **roles** seeded from master prompt §11 list (Platform Super Admin, Business Owner/Director, Branch/Depot Manager, Sales Manager, Cashier/POS Operator, Shop Attendant, Inventory Officer, Procurement Officer, Accountant, Sales Rep, Dispatch Officer, Auditor read-only, Support with explicit grants).
- **Scopes**: every permission evaluates against tenant → branch → warehouse/shop → salesperson assignment; enforced by a server-side guard on **every** operation (NestJS interceptor + policy tests). Hiding UI is never the control (fixes E2).
- Supervisor override: PIN re-auth, reason capture, full original identity in audit.

## 3. Application security

| Area | Control |
|---|---|
| Input validation | zod/DTO schemas on every endpoint; strict types; reject-unknown-fields |
| SQLi | parameterized queries only; no string-concatenated SQL (legacy pattern `'current_balance + '.$x` banned — killed by ORM/repository discipline) |
| XSS | framework auto-escaping; no `dangerouslySetInnerHTML` on user data; CSP headers |
| CSRF | SameSite cookies + token for state-changing browser requests |
| File uploads | type/size validation, image re-encoding, randomized storage names, malware scan hook, per-tenant quotas (fixes E8) |
|Updater RCE | no runtime code upload — deployments via CI/CD only (fixes E4) |
| Secrets | environment/secret store only; secret scanning in CI; per-tenant integration credentials encrypted (AES-GCM envelope) — never echoed back to UI (fixes Hubtel plaintext echo) |
| Transport | TLS everywhere; HSTS; certificate pinning optional for mobile |
| Headers | security headers baseline (CSP, X-Content-Type-Options, frame-ancestors…) |
| Dependency risk | lockfiles, Dependabot/renovate, SCA in CI |

## 4. Data protection

- Tenant isolation: tenant_id on every row + repository-level guard; RLS as defense-in-depth on tenant-owned tables (topology LOCKED — [target-architecture.md](target-architecture.md) §6); authorization tests must prove cross-tenant access impossible.
- PII minimization (customers are phone-first, email optional — matches Ghana practice); masking in logs; no production PII in test fixtures (synthetic factories only).
- Local device stores encrypted (SQLCipher/OS); secure keystore for tokens; remote wipe via device revocation.
- Backups: encrypted, tested restores, retention policy; DR runbook with RPO/RTO targets.

## 5. Audit controls (financial-grade)

- **Append-only `audit_event`**: actor (user/device), action, entity, before/after JSONB, request id, correlation id, IP, timestamp (UTC, rendered in tenant tz). Write-through interceptor; no delete/update path (revives the dead `audit_log` design).
- Sensitive actions with mandatory reason: void, reversal, adjustment, price override, discount beyond limit, refund, reprint, period close, migration steps.
- **Export/download audit** with permission + log (`reports.financial.export`).
- Immutability of posted financials: no UPDATE/DELETE on journal/payment/allocation rows post-commit; corrections only via reversal documents (fixes D11).
- Locked accounting periods; late-posting requires `accounting.close_period` override + reason.
- Reconciliation controls: nightly AR/AP subledger vs control-account check; stock balance vs ledger check; sync/idempotency duplicate check — discrepancies raise alerts, not silent repairs (the anti-`update_ables`).

## 6. POS-specific controls

- Cash drawer opens only within an authenticated open shift; drawer event logged.
- Reprint permission + audit; void/refund approvals; discount ceilings per role; negative-price/zero-quantity rejections.
- Offline-created transactions are signed with device identity and validated/re-played idempotently; tamper attempts (e.g. clock rollback) recorded.

## 7. Session, device & operations

- Structured logs with request/correlation ids; PII scrubbing; metrics (sync backlog, queue failures, migration failures, AI job failures); health/readiness endpoints; error tracking.
- Environment variables documented in `infra/` README; staging pipeline; release notes + semver.

## 8. Verification (tests that prove security)

- API authorization matrix test: every endpoint × role × scope (expected allow/deny) — fails CI on new unguarded routes (the direct fix for E1's class).
- Tenant isolation tests (cross-tenant access attempts).
- Migration tooling access tests (`migration.run` scope).
- Security regression suite from the legacy findings table (each E-item maps to at least one test).
