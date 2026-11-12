# Staging Runbook — idepot-staging.lightworldtech.com

Task C of [legacy/intake/2026-11-06/ZAI_HANDOFF.md](../../legacy/intake/2026-11-06/ZAI_HANDOFF.md).
Target: user-visible staging of the **merged `main`** (NOT any feature branch)
for owner/UAT testing, tracked in
[issue #10](https://github.com/christianagbotah/idepot/issues/10).

## Current status (2026-11-12): READY TO EXECUTE (assets) — blocked on infrastructure access

| Gate | Status |
|---|---|
| DNS control of `lightworldtech.com` (A/AAAA record for the staging subdomain) | **Not verifiable from the build environment** — requires owner/VPS action |
| VPS reachability (SSH), ports, disk/RAM/swap headroom | **Preflight script prepared; owner must run it** — see capacity gate below |
| Webuzo Nginx/TLS and coexistence with existing services | **Vhost snippet prepared** ([webuzo-vhost.conf.example](webuzo-vhost.conf.example)) — must be applied through Webuzo, never by editing managed config directly |
| Application build & deploy assets (this repo) | **Ready** — `scripts/deploy/` (package off-VPS → preflight → deploy → smoke → rollback), all dry-run by default |
| Legacy client under `/home/lightworld/webapps/depot1` | **Must not be touched** — preserved read-only; verified before/after by the smoke script |

The z.ai build environment has no route to the VPS and holds no VPS
credentials (and must not hold them in Git). Deployment therefore requires
either (a) the owner executing this runbook, or (b) a separately agreed
deployment channel. **No staging claim may be made until the verification
section below is completed and independently checked over HTTPS.**

## CAPACITY GATE (HARD — read first, 2026-11-12 preflight facts)

The 2026-11-12 read-only owner-authorized inspection found:

- **Disk: 313 GB total, 279 GB used, only ~32 GB free (90% used).**
- **RAM ~7 GiB available; 3 GiB swap — fully occupied (0 free).**
- The VPS co-hosts other Lightworld businesses and the live legacy depot
  client. **Every existing installation is protected.**

Consequences and REQUIRED headroom before any server-side build or large
DB restore:

1. **No server-side `npm ci`/build of the full monorepo.** The release is
   packaged OFF-VPS by `scripts/deploy/package-release.sh` (pinned SHA,
   `npm ci`, full verification, standalone web build, pruned production
   dependencies, checksums + provenance) and shipped as a single tarball
   (~an order of magnitude smaller than a source checkout + build tree).
2. **Minimum free-space gate before deploy: 20 GB free AND < 85% used**
   (the tarball, extracted release, PG staging DB, WAL growth and PM2 logs
   must all fit with margin). The deploy script REFUSES to proceed below
   the gate. Freeing space is an owner decision — see the read-only
   analysis commands below. **Never delete production DB backups, uploaded
   media, active releases of other apps, or any customer data.**
3. **Swap exhaustion is an abort condition.** With 0 free swap and ~7 GiB
   RAM shared with other live services, `npm ci`/build on the VPS would
   OOM-kill or evict other tenants' processes. Node/PM2 services we start
   are memory-capped (see ecosystem config) and PostgreSQL work_mem stays
   at defaults. If swap is still exhausted at deploy time, the operator
   must first establish headroom (owner decision) and record evidence in
   #10.
4. **Log rotation is mandatory** from the first deploy (PM2 `max_size`/
   `retain` in the ecosystem file) — unrotated logs on a 90%-full disk are
   how depots die.

### Read-only disk analysis (owner runs; nothing is deleted by these)

```bash
# 1. biggest directories under the webapps root (where releases live)
du -xh --max-depth=2 /home/lightworld/webapps 2>/dev/null | sort -rh | head -30
# 2. unreferenced OLD release directories of OTHER apps (candidate cleanup — OWNER APPROVAL ONLY):
#    a release dir is "unreferenced" when no symlink (e.g. .../current) points at it
#    and no PM2 process cwd lies inside it. LIST ONLY:
for app in /home/lightworld/webapps/*/; do
  echo "== $app"; ls -ld "$app"current 2>/dev/null
  find "$app"releases -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while read -r r; do
    ref=$(readlink -f "$app"current 2>/dev/null)
    [ "$ref" = "$(readlink -f "$r")" ] || echo "  unreferenced-candidate: $r ($(du -sh "$r" 2>/dev/null | cut -f1))"
  done
  pm2 jlist 2>/dev/null | python3 -c "import json,sys;[print('  pm2-cwd:',p['pm2_env'].get('pm_cwd')) for p in json.load(sys.stdin)]" 2>/dev/null
done
# 3. caches (npm/yarn — safe to clean ONLY with owner approval)
du -sh ~/.npm ~/.cache /root/.npm /usr/local/share/.cache 2>/dev/null
# 4. rotated/compressed logs and journals (candidates — OWNER APPROVAL ONLY)
find /var/log -type f \( -name '*.gz' -o -name '*.1' -o -name '*.old' \) -size +10M -printf '%s %p\n' 2>/dev/null | sort -rn | head -20
journalctl --disk-usage 2>/dev/null
# 5. PG/WAL and backup footprint (report only — NEVER delete backups)
sudo -u postgres psql -Atc "SELECT pg_size_pretty(pg_database_size(datname)), datname FROM pg_database ORDER BY pg_database_size(datname) DESC"
du -sh /var/lib/postgresql/*/main/pg_wal 2>/dev/null
# 6. free-space trend so a deploy can be scheduled with margin
df -h /; df -i /
```

Record outputs (with timestamps) in issue #10 before proceeding. Cleanup of
anything found is an explicit owner-approved action; this runbook and its
scripts NEVER delete anything automatically.

## Pre-flight (owner, read-only, ~10 min)

Run `scripts/deploy/staging-preflight.sh` (read-only by design) or the
equivalent manual steps:

```bash
ssh <user>@vps
# 1. capacity — see CAPACITY GATE above for thresholds
free -m; df -h /home; df -i /home; nproc; swapon --show
# 2. ports in use (pick two free loopback ports, e.g. 4310 web / 4311 api)
ss -tlnp | grep -E ':(80|443|4310|4311)\b'
# 3. existing services (do not disturb)
pm2 list; systemctl list-units --type=service --state=running | grep -Ei 'nginx|webuzo|mysql|postgres'
# 4. confirm the legacy app is untouched throughout
ls -ld /home/lightworld/webapps/depot1
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/ -H 'Host: <legacy-host>' || true
# 5. node/pm2 versions (must satisfy engines in package.json; LTS only)
node --version; npm --version; pm2 --version
```

Record outputs in issue #10 before proceeding.

## Deployment (owner or agreed channel)

All scripts live in `scripts/deploy/`, are **dry-run by default**, and print
exactly what they would do. Each destructive or service-affecting step
requires the explicit `--execute` flag. Nothing runs `git reset --hard`,
nothing `rm -rf`s an active release, nothing edits Webuzo's managed vhost
files, and nothing deletes backups.

1. **Package the release OFF-VPS** (build machine with repo access):
   ```bash
   scripts/deploy/package-release.sh <sha>          # dry-run plan
   scripts/deploy/package-release.sh <sha> --execute
   # → release-<sha>.tar.gz + release-<sha>.SHA256SUMS + PROVENANCE.txt
   ```
   Pins the SHA, `npm ci`, runs lint/typecheck/build/unit/integration, builds
   the Next.js standalone bundle + NestJS dist, prunes production deps,
   embeds the SHA (`IDEPOT_DEPLOY_SHA` / `NEXT_PUBLIC_GIT_SHA`), and writes
   checksums + provenance (git describe, builder host, node/npm versions).
   Upload the tarball to the VPS (owner channel).

2. **Preflight ON the VPS** (read-only): `scripts/deploy/staging-preflight.sh`
   — enforces the CAPACITY GATE (free space, swap, inode), checks ports,
   PM2, node version, PostgreSQL, and records a depot1 before-snapshot.
   Must exit 0 before deploying.

3. **Deploy ON the VPS**:
   ```bash
   scripts/deploy/staging-deploy.sh release-<sha>.tar.gz            # plan
   scripts/deploy/staging-deploy.sh release-<sha>.tar.gz --execute
   ```
   Creates `/home/lightworld/webapps/idepot-staging/releases/<sha>/`,
   extracts, verifies checksums, provisions the **separate** PostgreSQL
   role/DB `idepot_staging` (never the legacy MariaDB) if absent, applies
   idempotent migrations, writes `chmod 600` `.env.api`/`.env.web` with
   freshly generated random secrets (if absent), registers PM2 apps
   `idepot-staging-api` (127.0.0.1:4311) and `idepot-staging-web`
   (127.0.0.1:4310) from `infra/pm2/idepot-staging.ecosystem.config.cjs`,
   runs the seed (`scripts/deploy/seed-staging.ts` — synthetic tenant +
   admin/accountant/manager/cashier/auditor, credentials to a `chmod 600`
   file outside Git), health-checks the new release on its loopback ports,
   and only then atomically flips the `current` symlink. The previous
   release is kept; `releases/` retention keeps the newest N (default 5).

4. **Reverse proxy + TLS (through Webuzo, not by editing its files)** —
   apply [webuzo-vhost.conf.example](webuzo-vhost.conf.example) via the
   Webuzo panel: HTTP→HTTPS redirect, certificate for
   `idepot-staging.lightworldtech.com`, `/api` → 127.0.0.1:4311, `/` →
   127.0.0.1:4310. DNS: an A record (and AAAA if the VPS has IPv6) for
   `idepot-staging.lightworldtech.com` → VPS IP must be created by whoever
   controls the `lightworldtech.com` zone. **Until DNS + TLS verify, there
   is no public staging URL and none may be claimed.**

5. **Smoke + UAT**: `scripts/deploy/staging-smoke.sh https://idepot-staging.lightworldtech.com`
   (V1/V7/V8 automation; V2–V6 are owner walkthroughs recorded in
   [UAT-EVIDENCE.md](UAT-EVIDENCE.md) with screenshots).

## Verification (must ALL pass before claiming staging live)

| # | Check | Evidence to attach in issue #10 |
|---|---|---|
| V1 | `https://idepot-staging.lightworldtech.com/api/health` returns the pinned SHA + `database: up` | curl output (automated in staging-smoke.sh) |
| V2 | HTTPS login as demo cashier works; HTTP redirects to HTTPS | screenshot |
| V3 | Full cycle on synthetic data: POS sale → invoice → receipt print → payment | screenshots |
| V4 | GRN → supplier invoice → payment → AP aging reflects it | screenshots |
| V5 | Return → credit note → refund/store credit decomposition | screenshots |
| V6 | TB balanced; P&L/BS/CF render with figures tying to the cycle | screenshots |
| V7 | PM2 health: both services online after `pm2 restart`; no error storm in logs | pm2 list + log tail (automated in staging-smoke.sh) |
| V8 | Legacy site `depot1` unchanged (HTTP 200, no downtime, no file mtimes changed) | before/after probe (automated in staging-smoke.sh) |
| V9 | Rollback rehearsed: previous release symlink/PM2 revert restores service | `scripts/deploy/staging-rollback.sh --execute` log |

## Rollback

Releases directory layout: `releases/<sha>/` + `current` symlink.
`scripts/deploy/staging-rollback.sh` (dry-run default, `--execute` to act)
selects the previous release, health-checks it on a scratch port first,
then flips `current` and restarts the two PM2 apps. Database migrations
are additive-only by policy; a rollback never rolls back the schema
(documented, accepted — staging data is synthetic).

## Backup & restore check

`scripts/deploy/staging-backup.sh` (dry-run default): `pg_dump -Fc` of the
staging DB + tar of the current release into
`/home/lightworld/backups/idepot-staging/` with date-stamped names and a
retention count (default 14 — oldest beyond retention are listed, and
removed ONLY with `--execute`). **Production backups of other apps are
never touched.** `scripts/deploy/staging-restore-check.sh` restores the
newest backup into a scratch DB and verifies row counts + health — proving
the backup is usable without touching the live staging DB.

## Security constraints (hard)

- No raw `depot.zip`/`depot.sql`, credentials, logs or client PII in this
  public repo or on the staging domain.
- The staging DB contains **synthetic data only** until a separately
  authorized full-data rehearsal (issue #9) is approved.
- The legacy production app, its database and its vhost are untouched.
- Secrets only in `chmod 600` env files outside Git; rotate on every
  redeploy decision; demo credentials shared over a side channel.
