#!/usr/bin/env bash
# iDepot staging DEPLOY — run ON the VPS against an off-VPS-built release
# tarball (see package-release.sh). DRY-RUN by default; --execute to act.
#
#   scripts/deploy/staging-deploy.sh release-<sha>.tar.gz [--execute]
#
# What it does (all printed first):
#   1. verifies the tarball checksum file (if provided) and SHA256SUMS inside
#   2. capacity re-check (preflight must have passed today)
#   3. provisions the SEPARATE PostgreSQL role + database (never the legacy
#      MariaDB; never another app's DB)
#   4. extracts to releases/<sha>/ (never over an existing release)
#   5. applies idempotent migrations via the runner
#   6. writes chmod-600 .env.api/.env.web with freshly generated secrets
#      (only when absent — redeploys keep existing secrets by design)
#   7. registers/starts PM2 apps on loopback ports from the ecosystem config
#   8. health-checks the new release on its loopback ports
#   9. atomically flips `current` -> releases/<sha> and restarts
#  10. retention: lists releases beyond the newest N (removal is a SEPARATE
#      owner-approved step — nothing is deleted here)
#
# NEVER: git reset --hard, rm -rf of active releases, editing Webuzo vhosts,
# touching depot1 or other apps, deleting backups.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"

TARBALL="${1:-}"
[[ $# -gt 1 && "$2" == "--execute" ]] || true
if [[ -z "$TARBALL" ]]; then usage_banner; echo "  <release.tar.gz>  built by package-release.sh" >&2; exit 2; fi
[[ -f "$TARBALL" ]] || die "tarball not found: $TARBALL"

# derive the short sha from the tarball name (release-<sha>.tar.gz)
SHORT_SHA="$(basename "$TARBALL" .tar.gz)"
SHORT_SHA="${SHORT_SHA#release-}"
[[ "$SHORT_SHA" =~ ^[0-9a-f]{7,40}$ ]] || die "cannot derive sha from $(basename "$TARBALL")"
RELEASE_DIR="$IDEPOT_RELEASES_DIR/$SHORT_SHA"
[[ -e "$RELEASE_DIR" ]] && die "release already exists: $RELEASE_DIR (redeploys must use a NEW sha; never overwrite)"

SAY_PREFIX="deploy $SHORT_SHA"

say "== $SAY_PREFIX =="
say "  tarball  : $TARBALL"
say "  target   : $RELEASE_DIR"
say "  ports    : web 127.0.0.1:$IDEPOT_WEB_PORT / api 127.0.0.1:$IDEPOT_API_PORT"
say "  database : $IDEPOT_PG_ROLE/$IDEPOT_PG_DB (separate instance-role; legacy MariaDB untouched)"

# ---------------------------------------------------------------- 1. verify
say ""
say "[1/9] checksums"
if [[ -f "$TARBALL.sha256" ]]; then
  ( cd "$(dirname "$TARBALL")" && sha256sum -c "$(basename "$TARBALL").sha256" ) || die "tarball checksum mismatch"
else
  warn "no .sha256 sidecar for the tarball — proceeding (operator supplied out-of-band)"
fi

# ---------------------------------------------------------------- 2. capacity
say "[2/9] capacity re-check"
FREE_GB="$(df -P /home | tail -1 | awk '{print int($4/1024/1024)}')"
(( FREE_GB >= IDEPOT_MIN_FREE_GB )) || die "only ${FREE_GB} GiB free (< ${IDEPOT_MIN_FREE_GB}) — run staging-preflight.sh and the runbook's disk analysis first"

# ---------------------------------------------------------------- 3. extract
say "[3/9] extract to $RELEASE_DIR"
doit "mkdir -p '$IDEPOT_RELEASES_DIR'"
doit "tar -xzf '$TARBALL' -C '$IDEPOT_RELEASES_DIR'"
# the tarball root directory is release-<sha>; normalize to releases/<sha>
doit "mv '$IDEPOT_RELEASES_DIR/release-$SHORT_SHA' '$RELEASE_DIR'"
if [[ $DRY_RUN -eq 0 ]]; then
  ( cd "$RELEASE_DIR" && sha256sum -c SHA256SUMS --quiet ) || die "release content checksums mismatch — aborting before any service change"
fi

# ---------------------------------------------------------------- 4. database
say "[4/9] PostgreSQL role/db (separate from every other app)"
PG_PASSWORD_FILE="$IDEPOT_APP_ROOT/.pgpassword"
if sudo -u postgres psql -Atc "SELECT 1 FROM pg_roles WHERE rolname='$IDEPOT_PG_ROLE'" | grep -q 1; then
  say "  role $IDEPOT_PG_ROLE exists (redeploy)"
else
  PG_PASS="$(openssl rand -hex 24)"
  doit "mkdir -p '$IDEPOT_APP_ROOT' '$(dirname "$PG_PASSWORD_FILE")'"
  doit "printf '%s' '$PG_PASS' > '$PG_PASSWORD_FILE' && chmod 600 '$PG_PASSWORD_FILE'" 
  run_sudo "-u postgres psql -c \"CREATE ROLE $IDEPOT_PG_ROLE LOGIN PASSWORD '$PG_PASS'\""
  say "  (password written to $PG_PASSWORD_FILE, chmod 600 — never to Git)"
fi
if sudo -u postgres psql -Atc "SELECT 1 FROM pg_database WHERE datname='$IDEPOT_PG_DB'" | grep -q 1; then
  say "  database $IDEPOT_PG_DB exists (redeploy — migrations are idempotent)"
else
  run_sudo "-u postgres createdb -O $IDEPOT_PG_ROLE $IDEPOT_PG_DB"
fi

# ---------------------------------------------------------------- 5. migrations
say "[5/9] apply migrations (idempotent, additive-only 0001..0020+)"
PG_PASS_ACTUAL="$( [[ -f "$PG_PASSWORD_FILE" ]] && cat "$PG_PASSWORD_FILE" || echo '')"
ADMIN_URL="postgresql://$IDEPOT_PG_ROLE:${PG_PASS_ACTUAL}@127.0.0.1:5432/$IDEPOT_PG_DB"
if [[ $DRY_RUN -eq 1 ]]; then
  plan "cd '$RELEASE_DIR/migrations' && DATABASE_ADMIN_URL=… npx tsx run.ts (from the pinned runner)"
else
  ( cd "$RELEASE_DIR" && IDEPOT_MIGRATION_PG_ADMIN_URL="$ADMIN_URL" node runner/node_modules/.bin/tsx migrations/run.ts --url "$ADMIN_URL" ) \
    || die "migrations failed — release left in place (NOT switched to current; nothing serving it yet)"
fi

# ---------------------------------------------------------------- 6. env files
say "[6/9] env files (chmod 600, outside Git; generated only when absent)"
gen_env() {
  local ENVFILE="$1" PORT="$2" EXTRA="$3"
  if [[ -f "$ENVFILE" ]]; then say "  $ENVFILE exists — keeping existing secrets (rotate deliberately)"; return; fi
  local JWT PGURL
  JWT="$(openssl rand -hex 32)"
  PGURL="postgresql://$IDEPOT_PG_ROLE:${PG_PASS_ACTUAL:-<see .pgpassword>}@127.0.0.1:5432/$IDEPOT_PG_DB"
  doit "printf 'IDEPOT_DATABASE_URL=%s\\nIDEPOT_DATABASE_ADMIN_URL=%s\\nIDEPOT_JWT_SECRET=%s\\nPORT=%s\\nIDEPOT_DEPLOY_SHA=%s\\n%s\\n' \
    '$PGURL' '$PGURL' '$JWT' '$PORT' '$SHORT_SHA' '$EXTRA' > '$ENVFILE'"
  doit "chmod 600 '$ENVFILE'"
}
gen_env "$IDEPOT_APP_ROOT/.env.api" "$IDEPOT_API_PORT" ""
gen_env "$IDEPOT_APP_ROOT/.env.web" "$IDEPOT_WEB_PORT" "NEXT_PUBLIC_GIT_SHA=$SHORT_SHA"
gen_env "$IDEPOT_APP_ROOT/.env.seed" "" "IDEPOT_SEED_DB_URL=$ADMIN_URL"

# ---------------------------------------------------------------- 7. pm2
say "[7/9] PM2 services (loopback-only; memory-capped; log rotation)"
doit "pm2 start '$RELEASE_DIR/pm2/idepot-staging.ecosystem.config.cjs' --update-env || pm2 start '$RELEASE_DIR/pm2/idepot-staging.ecosystem.config.cjs'"
doit "pm2 save"

# ---------------------------------------------------------------- 8. health
say "[8/9] health-check the new release on loopback (before flipping current)"
if [[ $DRY_RUN -eq 0 ]]; then
  for _ in $(seq 1 30); do
    API_RESP="$(curl -fsS "http://127.0.0.1:$IDEPOT_API_PORT/api/health" 2>/dev/null || true)"
    [[ "$API_RESP" == *'"status":"ok"'* ]] && break
    sleep 2
  done
  [[ "${API_RESP:-}" == *'"status":"ok"'* && "${API_RESP:-}" == *"$SHORT_SHA"* ]] \
    || die "health check failed (got: ${API_RESP:-none}). current NOT flipped; previous release keeps serving."
  ok "api health: $API_RESP"
fi

# ---------------------------------------------------------------- 9. flip
say "[9/9] atomically switch current -> releases/$SHORT_SHA"
doit "ln -sfn '$RELEASE_DIR' '${IDEPOT_CURRENT_LINK}.tmp' && mv -Tf '${IDEPOT_CURRENT_LINK}.tmp' '$IDEPOT_CURRENT_LINK'"
doit "pm2 restart $IDEPOT_PM2_WEB $IDEPOT_PM2_API"

# seed (synthetic demo tenant; idempotent; credentials to chmod-600 file)
say "seeding synthetic demo tenant (idempotent)"
if [[ $DRY_RUN -eq 0 ]]; then
  ( cd "$RELEASE_DIR" && node runner/node_modules/.bin/tsx seed/seed-staging.ts ) || warn "seed reported an issue — check output; deployment continues"
fi

# retention: LIST only
say ""
say "retention (informational — removal is a separate owner-approved step):"
ls -1t "$IDEPOT_RELEASES_DIR" 2>/dev/null | tail -n +"$((IDEPOT_RELEASES_KEEP + 1))" | sed 's/^/  beyond keep-N: /' || true
say ""
ok "DEPLOYED $SHORT_SHA (dry-run: $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no))"
say "Next: staging-smoke.sh https://idepot-staging.lightworldtech.com"
