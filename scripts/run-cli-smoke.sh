#!/usr/bin/env bash
# End-to-end CLI smoke: embedded PG + MariaDB staging + fixture dump + idepot-migrate CLI.
set -euo pipefail
cd /home/z/my-project/idepot
URLFILE=/home/z/my-project/idepot/.pg-test/cli-url
rm -f "$URLFILE"

node scripts/boot-cli-pg.mjs &
BOOTPID=$!
trap 'kill $BOOTPID 2>/dev/null || true' EXIT

for i in $(seq 1 60); do [ -f "$URLFILE" ] && break; sleep 0.5; done
PG_URL=$(cat "$URLFILE")

npx tsx infra/migrations/run.ts --url "$PG_URL"

IDEPOT_MIGRATION_PG_ADMIN_URL="$PG_URL" \
IDEPOT_MIGRATION_MYSQL_URL="${IDEPOT_MIGRATION_MYSQL_URL:-mysql://idepot_migration:idepot_migration_local@127.0.0.1:3307/idepot_legacy_staging}" \
IDEPOT_MIGRATION_ARTIFACTS_DIR=/home/z/my-project/idepot/migration-artifacts \
npx tsx packages/migration/src/cli.ts smoke --dump fixtures/legacy-mysql/idepot_phase1_fixture.sql

kill $BOOTPID 2>/dev/null || true
