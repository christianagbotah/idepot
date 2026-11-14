#!/usr/bin/env bash
# iDepot staging ROLLBACK — flip `current` back to the previous release and
# restart PM2. DRY-RUN by default; --execute to act.
#
#   scripts/deploy/staging-rollback.sh [--execute]
#
# Rules: never deletes any release; never touches the database schema
# (migrations are additive-only by policy); health-checks the rollback target
# before committing to it; prints every step first.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"

say "iDepot staging rollback (dry-run: $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no))"

[[ -d "$IDEPOT_RELEASES_DIR" ]] || die "no releases directory at $IDEPOT_RELEASES_DIR"
CURRENT_TARGET="$(readlink "$IDEPOT_CURRENT_LINK" 2>/dev/null || true)"
CURRENT_SHA="$(basename "${CURRENT_TARGET:-none}")"
say "  current : $CURRENT_SHA"

# previous = the second-newest release directory by mtime (glob, no ls|grep)
PREV=""
for d in "$IDEPOT_RELEASES_DIR"/*/; do
  d_name="$(basename "$d")"
  [[ "$d_name" == "$CURRENT_SHA" ]] && continue
  if [[ -z "$PREV" || "$d" -nt "$IDEPOT_RELEASES_DIR/$PREV/" ]]; then PREV="$d_name"; fi
done
[[ -n "$PREV" ]] || die "no previous release to roll back to (only $CURRENT_SHA exists)"
say "  target  : $PREV"

# health-check the target's static integrity before switching
if [[ $DRY_RUN -eq 0 ]]; then
  [[ -f "$IDEPOT_RELEASES_DIR/$PREV/api/dist/main.js" ]] || die "rollback target has no api/dist/main.js — refusing"
  [[ -f "$IDEPOT_RELEASES_DIR/$PREV/web/server.js" ]] || die "rollback target has no web/server.js — refusing"
fi

plan "flip current: $CURRENT_SHA -> $PREV"
doit "ln -sfn '$IDEPOT_RELEASES_DIR/$PREV' '${IDEPOT_CURRENT_LINK}.tmp' && mv -Tf '${IDEPOT_CURRENT_LINK}.tmp' '$IDEPOT_CURRENT_LINK'"
doit "pm2 restart $IDEPOT_PM2_WEB $IDEPOT_PM2_API"

if [[ $DRY_RUN -eq 0 ]]; then
  for _ in $(seq 1 30); do
    RESP="$(curl -fsS "http://127.0.0.1:$IDEPOT_API_PORT/api/health" 2>/dev/null || true)"
    [[ "$RESP" == *'"status":"ok"'* ]] && break
    sleep 2
  done
  [[ "${RESP:-}" == *'"status":"ok"'* ]] || die "rollback health check FAILED — investigate immediately (services may be down)"
  ok "rolled back to $PREV — health: $RESP"
  say "NOTE: schema stays at the newest migration set (additive-only policy, documented in the runbook)."
  say "      $CURRENT_SHA is NOT deleted; it can be re-flipped after diagnosis."
else
  say "dry-run complete — re-run with --execute to roll back"
fi
