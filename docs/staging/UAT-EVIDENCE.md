# UAT Evidence — idepot-staging.lightworldtech.com (issue #10)

> Template + running record. **A passing build is NOT a passing UAT.** Every
> row needs real evidence (curl output, screenshot, log excerpt) captured on
> the deployed HTTPS URL. Nothing here may be marked PASS from a local or CI
> environment. Do not approve cutover — staging only.

| Field | Value |
|---|---|
| Staging URL | https://idepot-staging.lightworldtech.com (only after DNS+TLS verify) |
| Deployed SHA | (from `/api/health` — must match the release tarball) |
| Release provenance | (release-<sha>.PROVENANCE.txt checksum line) |
| Tester / date | (owner) |
| Result | ⬜ NOT STARTED |

## Automated gates

| Check | Evidence | Status |
|---|---|---|
| staging-preflight.sh (capacity/swap/ports/stack) | paste output | ⬜ |
| staging-smoke.sh (V1/V1b/V7/V8) | paste output | ⬜ |
| uat-smoke.ts (V3–V6 API cycles, exact math) | uat-evidence.md attached | ⬜ |
| staging-backup.sh + staging-restore-check.sh | paste output | ⬜ |

## V1–V9 (runbook gates)

| # | Check | Evidence (attach) | Status |
|---|---|---|---|
| V1 | `/api/health` returns pinned SHA + `database: up` | curl output | ⬜ |
| V2 | HTTPS login as demo cashier; HTTP→HTTPS redirect | screenshot | ⬜ |
| V3 | POS sale → invoice → receipt print → payment | screenshots | ⬜ |
| V4 | GRN → supplier invoice → payment → AP aging | screenshots | ⬜ |
| V5 | Return → credit note → refund/store-credit decomposition | screenshots | ⬜ |
| V6 | TB balanced; P&L/BS/CF render and tie to the cycle | screenshots | ⬜ |
| V7 | PM2 restart health; no error storm | pm2 list + log tail | ⬜ |
| V8 | depot1 unchanged before/after (HTTP 200, mtimes) | before/after probe | ⬜ |
| V9 | Rollback rehearsed (staging-rollback.sh) | timestamped log | ⬜ |

## Menu-route walkthrough (owner; screenshot each route as the listed role)

Roles: O=owner, A=admin, C=cashier, M=manager, T=accountant, U=auditor.

| Route | Role | Screenshot | Status |
|---|---|---|---|
| `/` dashboard | O | | ⬜ |
| `/pos` | C | | ⬜ |
| `/sales`, `/sales-orders`, `/payments`, `/deposits` | M | | ⬜ |
| `/customers`, `/suppliers` | M | | ⬜ |
| `/catalog`, `/categories`, `/units` | M | | ⬜ |
| `/warehouses` | M | | ⬜ |
| `/inventory` (+ stock count, transfer) | M | | ⬜ |
| `/purchasing`, `/ap` | M/T | | ⬜ |
| `/banking`, `/accounting` (journals, TB, P&L, BS, CF, periods) | T | | ⬜ |
| `/returns` (workbench, credit notes, store credits) | M | | ⬜ |
| `/reports` (11 tabs incl. as-of views) | T/U | | ⬜ |
| `/kpi` | T | | ⬜ |
| `/admin` (settings, users, audit search) | O/A | | ⬜ |
| `/profile` | any | | ⬜ |

## Critical workflow math spot-checks (from uat-smoke.ts; re-verify visually)

| Workflow | Expected | Observed | OK |
|---|---|---|---|
| Cash sale 4 × 50.00 (default tenant tax) | subtotal 200.00, total = 200 + tax, change 20.00 | | ⬜ |
| Credit sale + partial receipt 50.00 | allocation applied; due reduced exactly | | ⬜ |
| Return 1 unit → store credit | entitlement = 50.00 + its tax share | | ⬜ |
| Daily sales for the day | gross/returns/refunds on the right dates | | ⬜ |
| Trial balance | Σ debits = Σ credits | | ⬜ |
| AR control reconciliation | PASS with control == subledger | | ⬜ |

## Findings / blockers

| # | Finding | Severity | Owner | Status |
|---|---|---|---|---|
| | | | | |
