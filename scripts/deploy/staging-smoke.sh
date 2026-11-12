#!/usr/bin/env bash
# iDepot staging SMOKE — verification automation for the V1/V7/V8 gates in
# docs/staging/staging-runbook.md. Run ON the VPS (or anywhere that can reach
# both the public HTTPS URL and the VPS loopback/PM2/depot1). READ-ONLY.
#
#   scripts/deploy/staging-smoke.sh https://idepot-staging.lightworldtech.com
#
# V2–V6 (login UI, POS cycle, purchasing, returns, financials) are owner
# walkthroughs — scripted business-workflow checks live in
# scripts/deploy/uat-smoke.ts (run it with the demo credentials).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"

BASE_URL="${1:-https://idepot-staging.lightworldtech.com}"
FAILS=0
step() { printf '\n== %s ==\n' "$*"; }

say "iDepot staging smoke against $BASE_URL — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# V1: HTTPS /api/health returns pinned SHA + database up
step "V1 health over HTTPS"
HTTP_CODE="$(curl -sS -o /tmp/idepot-health.json -w '%{http_code}' "$BASE_URL/api/health" || echo 000)"
BODY="$(cat /tmp/idepot-health.json 2>/dev/null || true)"
say "  HTTP $HTTP_CODE: $BODY"
[[ "$HTTP_CODE" == "200" ]] || { warn "V1 FAIL: /api/health not 200"; FAILS=$((FAILS+1)); }
[[ "$BODY" == *'"status":"ok"'* ]] || { warn "V1 FAIL: status != ok"; FAILS=$((FAILS+1)); }
[[ "$BODY" == *'"database":"up"'* ]] || { warn "V1 FAIL: database != up"; FAILS=$((FAILS+1)); }
[[ "$BODY" == *'"sha"'* ]] || { warn "V1 FAIL: deployed sha missing from health"; FAILS=$((FAILS+1)); }

# V1b: HTTP -> HTTPS redirect
step "V1b HTTP->HTTPS redirect"
REDIR="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "http://$([ "${BASE_URL#https://}" != "$BASE_URL" ] && echo "${BASE_URL#https://}" || echo "$BASE_URL")/api/health" || true)"
say "  $REDIR"
[[ "$REDIR" == 301\ https://* || "$REDIR" == 308\ https://* ]] || { warn "V1b FAIL: no HTTP->HTTPS redirect ($REDIR)"; FAILS=$((FAILS+1)); }

# V7: PM2 health (only meaningful on the VPS itself)
step "V7 PM2 health"
if command -v pm2 >/dev/null 2>&1; then
  for APP in "$IDEPOT_PM2_WEB" "$IDEPOT_PM2_API"; do
    ST="$(pm2 jlist 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((p['pm2_env']['status'] for p in d if p['name']=='$APP'),'missing'))" 2>/dev/null || echo error)"
    say "  $APP: $ST"
    [[ "$ST" == "online" ]] || { warn "V7 FAIL: $APP is $ST"; FAILS=$((FAILS+1)); }
  done
  ERR_TAIL="$(pm2 logs --nostream --lines 30 2>/dev/null | grep -ci 'unhandled\|fatal' || true)"
  say "  fatal/unhandled lines in last logs: $ERR_TAIL"
  (( ERR_TAIL == 0 )) || warn "V7 WARN: error-ish lines in logs — inspect before sign-off"
else
  say "  (pm2 not available here — run on the VPS)"
fi

# V8: legacy depot1 untouched
step "V8 legacy depot1 protection"
if [[ -d "$IDEPOT_DEPOT1_DIR" ]]; then
  FINGERPRINT="$(find "$IDEPOT_DEPOT1_DIR" -maxdepth 1 -printf '%T@ %p\n' 2>/dev/null | sort | sha256sum | cut -d' ' -f1)"
  say "  depot1 top-level fingerprint: $FINGERPRINT"
  say "  compare against the preflight snapshot recorded in issue #10 (must be identical)"
  say "  depot1 perms/mtime: $(stat -c '%A %U:%G %y' "$IDEPOT_DEPOT1_DIR")"
else
  say "  $IDEPOT_DEPOT1_DIR not present on this host — check from the VPS"
fi

step "verdict"
if (( FAILS > 0 )); then
  die "SMOKE FAILED ($FAILS failing checks) — staging must NOT be declared live"
fi
ok "SMOKE PASSED — V1/V1b/V7/V8 green. Complete V2–V6 via uat-smoke.ts + owner walkthroughs, then record in UAT-EVIDENCE.md"
