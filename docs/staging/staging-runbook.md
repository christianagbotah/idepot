# Staging Runbook — idepot-staging.lightworldtech.com

Task C of [legacy/intake/2026-11-06/ZAI_HANDOFF.md](../../legacy/intake/2026-11-06/ZAI_HANDOFF.md).
Target: user-visible staging of the **merged `main`** (NOT the unreviewed
Phase 5 draft) for owner/UAT testing, tracked in
[issue #10](https://github.com/christianagbotah/idepot/issues/10).

## Current status (2026-11-09): BLOCKED on infrastructure access

| Gate | Status |
|---|---|
| DNS control of `lightworldtech.com` (A/AAAA record for the staging subdomain) | **Not verifiable from the build environment** — requires owner/VPS action |
| VPS reachability (SSH), ports, disk/RAM/swap headroom | **Not verifiable** — same |
| Webuzo Nginx/TLS and coexistence with existing services | **Not verifiable** — same |
| Application build & deploy assets (this repo) | **Ready** — runbook below is executable as written |
| Legacy client under `/home/lightworld/webapps/depot1` | **Must not be touched** — preserved read-only |

The z.ai build environment has no route to the VPS and holds no VPS
credentials (and must not hold them in Git). Deployment therefore requires
either (a) the owner executing this runbook, or (b) a separately agreed
deployment channel. **No staging claim may be made until the verification
section below is completed and independently checked over HTTPS.**

## Pre-flight (owner, read-only, ~10 min)

```bash
ssh <user>@<vps>
# 1. capacity
free -m; df -h /home; nproc
# 2. ports in use (pick two free loopback ports, e.g. 4310 web / 4311 api)
ss -tlnp | grep -E ':(80|443|4310|4311)\b'
# 3. existing services (do not disturb)
pm2 list; systemctl list-units --type=service --state=running | grep -Ei 'nginx|webuzo|mysql|postgres'
# 4. confirm the legacy app is untouched throughout
ls -ld /home/lightworld/webapps/depot1
```

Record outputs in issue #10 before proceeding.

## Deployment (owner or agreed channel)

1. **Pin the SHA** — deploy exactly `origin/main` HEAD; the build must embed
   it (e.g. `NEXT_PUBLIC_GIT_SHA` + `/api/health` reports it). Never deploy a
   feature branch to staging first.

2. **Database** — dedicated instance, user and DB; never the legacy MariaDB:
   ```bash
   sudo -u postgres createuser idepot_staging
   sudo -u postgres createdb -O idepot_staging idepot_staging
   # apply migrations (idempotent, checksum-verified)
   DATABASE_URL=postgres://... npx tsx infra/migrations/run.ts --url <admin-url>
   ```

3. **Secrets** — outside Git, `chmod 600` env file per service
   (`/home/lightworld/webapps/idepot-staging/.env.web`, `.env.api`); rotate
   JWT secrets; no production dumps or PII anywhere.

4. **Services** — PM2 (or systemd units) `idepot-staging-web` and
   `idepot-staging-api` on the two free loopback ports; web's API proxy
   points at the api port under `/api`; health endpoints wired to PM2
   restart policy; logs to structured files with rotation.

5. **Nginx/TLS (Webuzo)** — vhost for `idepot-staging.lightworldtech.com`:
   HTTP→HTTPS redirect, TLS certificate (Webuzo/Let's Encrypt), proxy
   `location /api` → api port, everything else → web port. Do not modify the
   legacy vhost.

6. **Synthetic demo tenant** — seed with the fixture/migration tooling (the
   CI-proven synthetic path), demo users for cashier/manager/accountant/admin
   with low-privilege passwords shared over a side channel — never in Git.

## Verification (must ALL pass before claiming staging live)

| # | Check | Evidence to attach in issue #10 |
|---|---|---|
| V1 | `https://idepot-staging.lightworldtech.com/api/health` returns the pinned SHA | curl output |
| V2 | HTTPS login as demo cashier works; HTTP redirects to HTTPS | screenshot |
| V3 | Full cycle on synthetic data: POS sale → invoice → receipt print → payment | screenshots |
| V4 | GRN → supplier invoice → payment → AP aging reflects it | screenshots |
| V5 | Return → credit note → refund/store credit decomposition | screenshots |
| V6 | TB balanced; P&L/BS/CF render with figures tying to the cycle | screenshots |
| V7 | PM2 health: both services online after `pm2 restart`; no error storm in logs | pm2 list + log tail |
| V8 | Legacy site `depot1` unchanged (HTTP 200, no downtime, no file mtimes changed) | before/after probe |
| V9 | Rollback rehearsed: previous release symlink/PM2 revert restores service | timestamped log |

## Rollback

Releases directory layout: `releases/<sha>/` + `current` symlink. Rollback =
`ln -sfn releases/<prev-sha> current && pm2 restart idepot-staging-web idepot-staging-api`.
Database migrations are additive-only by policy; a rollback never rolls back
the schema (documented, accepted — staging data is synthetic).

## Security constraints (hard)

- No raw `depot.zip`/`depot.sql`, credentials, logs or client PII in this
  public repo or on the staging domain.
- The staging DB contains **synthetic data only** until a separately
  authorized full-data rehearsal (issue #9) is approved.
- The legacy production app, its database and its vhost are untouched.
