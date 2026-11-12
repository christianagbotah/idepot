#!/usr/bin/env bash
# iDepot staging BACKUP — pg_dump the staging DB + tar the current release.
# DRY-RUN by default; --execute to act. NEVER touches other apps' backups.
#
#   scripts/deploy/staging-backup.sh [--execute]
#
# Output: /home/lightworld/backups/idepot-staging/
#   db-<timestamp>-<sha>.dump      (pg_dump -Fc)
#   release-<sha>.tar.gz           (copy of the current release tarball if present)
# Beyond IDEPOT_BACKUPS_KEEP backups are LISTED only; removal requires
# --execute AND is restricted to files matching OUR OWN naming pattern.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CURRENT_TARGET="$(readlink "$IDEPOT_CURRENT_LINK" 2>/dev/null || true)"
CURRENT_SHA="$(basename "${CURRENT_TARGET:-norelease}")"

say "iDepot staging backup (dry-run: $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no))"
say "  db     : $IDEPOT_PG_DB as postgres"
say "  release: $CURRENT_SHA"
say "  out    : $IDEPOT_BACKUP_ROOT"

doit "mkdir -p '$IDEPOT_BACKUP_ROOT'"
doit "sudo -u postgres pg_dump -Fc -d '$IDEPOT_PG_DB' -f '$IDEPOT_BACKUP_ROOT/db-$STAMP-$CURRENT_SHA.dump'"
if [[ -e "$CURRENT_TARGET" ]]; then
  doit "tar -czf '$IDEPOT_BACKUP_ROOT/release-$STAMP-$CURRENT_SHA.tar.gz' -C '$IDEPOT_RELEASES_DIR' '$CURRENT_SHA'"
fi

# retention — OUR files only, oldest beyond keep-count; delete needs --execute
OLD="$(ls -1t "$IDEPOT_BACKUP_ROOT"/db-*.dump "$IDEPOT_BACKUP_ROOT"/release-*.tar.gz 2>/dev/null | tail -n +"$((IDEPOT_BACKUPS_KEEP + 1))" || true)"
if [[ -n "$OLD" ]]; then
  say "beyond retention (kept=$((IDEPOT_BACKUPS_KEEP))):"
  say "$OLD" | sed 's/^/  /'
  if [[ $DRY_RUN -eq 0 ]]; then
    # hard safety: only ever delete files matching our exact naming pattern
    while read -r f; do
      [[ "$f" =~ $IDEPOT_BACKUP_ROOT/(db|release)-[0-9TZW:-]+[.-][0-9a-f]+\.(dump|tar\.gz)$ ]] || { warn "skipping non-pattern file: $f"; continue; }
      rm -f -- "$f"
      say "  removed $f"
    done <<<"$OLD"
  fi
else
  ok "retention: nothing beyond $IDEPOT_BACKUPS_KEEP"
fi
ok "backup complete (dry-run: $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no))"
