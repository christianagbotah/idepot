#!/usr/bin/env bash
# iDepot staging PREFLIGHT — run ON the VPS. 100% READ-ONLY.
# Enforces the CAPACITY GATE from docs/staging/staging-runbook.md before any
# deploy is allowed. Exits non-zero when a gate fails.
#
#   scripts/deploy/staging-preflight.sh
#
# Environment overrides: see scripts/deploy/lib.sh (IDEPOT_MIN_FREE_GB,
# IDEPOT_MAX_DISK_PCT, ports, paths...).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"

say "iDepot staging preflight (read-only) — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
FAILS=0

# ------------------------------------------------------------- capacity gate
say ""
say "== CAPACITY GATE (hard thresholds from the 2026-11-12 inspection) =="

# disk: free GB and used % of the filesystem that will host the app root
CHECK_PATH="$IDEPOT_APP_ROOT"
[[ -d "$CHECK_PATH" ]] || CHECK_PATH="$(dirname "$IDEPOT_APP_ROOT")"
[[ -d "$CHECK_PATH" ]] || CHECK_PATH=/home
DISK_LINE="$(df -P "$CHECK_PATH" | tail -1)"
DISK_AVAIL_KB="$(awk '{print $4}' <<<"$DISK_LINE")"
DISK_USED_PCT="$(awk '{gsub("%",""); print $5}' <<<"$DISK_LINE")"
[[ "$DISK_AVAIL_KB" =~ ^[0-9]+$ ]] || { warn "cannot parse df output: $DISK_LINE"; FAILS=$((FAILS+1)); }
DISK_AVAIL_GB=$(( DISK_AVAIL_KB / 1024 / 1024 ))
say "  disk: ${DISK_USED_PCT}% used, ${DISK_AVAIL_GB} GiB free (gate: <=${IDEPOT_MAX_DISK_PCT}% and >=${IDEPOT_MIN_FREE_GB} GiB)"
if (( DISK_USED_PCT > IDEPOT_MAX_DISK_PCT )); then
  warn "DISK GATE FAILED: ${DISK_USED_PCT}% used > ${IDEPOT_MAX_DISK_PCT}%"
  warn "  Run the READ-ONLY disk analysis in docs/staging/staging-runbook.md and have the OWNER approve any cleanup."
  FAILS=$((FAILS+1))
fi
if (( DISK_AVAIL_GB < IDEPOT_MIN_FREE_GB )); then
  warn "DISK GATE FAILED: ${DISK_AVAIL_GB} GiB free < ${IDEPOT_MIN_FREE_GB} GiB"
  FAILS=$((FAILS+1))
fi

# swap exhaustion
SWAP_FREE_KB="$(awk '/^SwapFree:/{print $2}' /proc/meminfo)"
SWAP_TOTAL_KB="$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)"
if (( SWAP_TOTAL_KB > 0 )); then
  SWAP_FREE_MB=$(( SWAP_FREE_KB / 1024 ))
  say "  swap: ${SWAP_FREE_MB} MiB free of $(( SWAP_TOTAL_KB / 1024 )) MiB"
  if (( SWAP_FREE_KB == 0 )); then
    warn "SWAP GATE FAILED: swap fully occupied — a deploy/build here can OOM co-hosted services."
    warn "  Establish swap/RAM headroom first (owner decision), then re-run preflight."
    FAILS=$((FAILS+1))
  fi
else
  say "  swap: none configured"
fi

# inodes
INODE_PCT="$(df -Pi /home | tail -1 | awk '{gsub("%",""); print $5}')"
say "  inodes: ${INODE_PCT}% used"
(( INODE_PCT < 90 )) || { warn "INODE GATE FAILED: ${INODE_PCT}% >= 90%"; FAILS=$((FAILS+1)); }

# ------------------------------------------------------------------- ports
say ""
say "== loopback ports (web ${IDEPOT_WEB_PORT} / api ${IDEPOT_API_PORT}) =="
for PORT in "$IDEPOT_WEB_PORT" "$IDEPOT_API_PORT"; do
  if ss -tln "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
    warn "port $PORT already LISTENING — pick another (IDEPOT_WEB_PORT/IDEPOT_API_PORT) or stop the stale service"
    FAILS=$((FAILS+1))
  else
    ok "port $PORT free"
  fi
done

# ------------------------------------------------------------------- stack
say ""
say "== runtime stack =="
NODE_MAJOR="$(node --version 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)"
say "  node: $(node --version 2>/dev/null || echo MISSING) (need LTS >= 20)"
(( NODE_MAJOR >= 20 )) || { warn "node too old/missing"; FAILS=$((FAILS+1)); }
command -v pm2 >/dev/null && ok "pm2 $(pm2 --version)" || { warn "pm2 missing"; FAILS=$((FAILS+1)); }
command -v psql >/dev/null && ok "psql $(psql --version | head -1)" || { warn "psql missing (PostgreSQL client)"; FAILS=$((FAILS+1)); }
sudo -u postgres psql -Atc "SELECT 1" >/dev/null 2>&1 && ok "PostgreSQL server reachable via sudo -u postgres" \
  || { warn "cannot reach PostgreSQL as postgres via sudo"; FAILS=$((FAILS+1)); }

# existing PM2 apps (must not conflict with idepot-staging names)
say ""
say "== existing PM2 processes (protected — informational) =="
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print('  ', p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin)]" 2>/dev/null || say "  (pm2 empty or unavailable)"
if pm2 jlist 2>/dev/null | grep -q "\"$IDEPOT_PM2_API\"\|\"$IDEPOT_PM2_WEB\""; then
  warn "PM2 names $IDEPOT_PM2_API/$IDEPOT_PM2_WEB already exist (redeploy expected; first deploy must not see them)"
fi

# ------------------------------------------------------------- legacy guard
say ""
say "== legacy depot1 protection snapshot (before) =="
if [[ -d "$IDEPOT_DEPOT1_DIR" ]]; then
  DEPOT1_MTIME_SNAP="$(find "$IDEPOT_DEPOT1_DIR" -maxdepth 1 -printf '%T@ %p\n' 2>/dev/null | sort | sha256sum | cut -d' ' -f1)"
  say "  dir       : $IDEPOT_DEPOT1_DIR exists"
  say "  fingerprint: $DEPOT1_MTIME_SNAP (re-run this script after deploy; staging-smoke.sh also compares)"
else
  say "  dir   : $IDEPOT_DEPOT1_DIR not found on this host (fine if the legacy app lives elsewhere)"
fi

# ------------------------------------------------------------------ verdict
say ""
if (( FAILS > 0 )); then
  die "PREFLIGHT FAILED with $FAILS gate(s). Fix the reported conditions (owner-approved actions only) and re-run."
fi
ok "PREFLIGHT PASSED — all gates green. Next: staging-deploy.sh <release.tar.gz> --execute"
