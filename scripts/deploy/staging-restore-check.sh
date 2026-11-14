#!/usr/bin/env bash
# iDepot staging RESTORE CHECK — proves the newest backup is usable WITHOUT
# touching the live staging DB: restores into a scratch database, counts core
# tables, drops the scratch. DRY-RUN by default; --execute to act.
#
#   scripts/deploy/staging-restore-check.sh [--execute]
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"

NEWEST_DUMP="$(ls -1t "$IDEPOT_BACKUP_ROOT"/db-*.dump 2>/dev/null | head -1 || true)"
[[ -n "$NEWEST_DUMP" ]] || die "no db backup found in $IDEPOT_BACKUP_ROOT — run staging-backup.sh first"
SCRATCH_DB="idepot_staging_restorecheck_$(date +%s)"

say "iDepot staging restore check (dry-run: $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no))"
say "  backup : $NEWEST_DUMP ($(du -h "$NEWEST_DUMP" | cut -f1))"
say "  scratch: $SCRATCH_DB (dropped after the check; live $IDEPOT_PG_DB untouched)"

run_sudo "-u postgres createdb $SCRATCH_DB"
run_sudo "-u postgres pg_restore --no-owner --dbname=$SCRATCH_DB '$NEWEST_DUMP'"

if [[ $DRY_RUN -eq 0 ]]; then
  COUNTS="$(sudo -u postgres psql -Atc "
    SELECT 'tenant='||count(*) FROM tenant UNION ALL
    SELECT 'app_user='||count(*) FROM app_user UNION ALL
    SELECT 'product='||count(*) FROM product UNION ALL
    SELECT 'invoice='||count(*) FROM invoice UNION ALL
    SELECT 'journal_entry='||count(*) FROM journal_entry" "$SCRATCH_DB")"
  say "$COUNTS" | sed 's/^/  /'
  echo "$COUNTS" | grep -q "tenant=0" && warn "restored backup has ZERO tenants — is this the right backup?"
  ok "restore verified into scratch DB"
else
  plan "restore + row counts + drop scratch (dry-run)"
fi
run_sudo "-u postgres dropdb $SCRATCH_DB"
ok "restore check complete"
