#!/usr/bin/env bash
# End-to-end CLI smoke: embedded PG + MariaDB staging + fixture dump + idepot-migrate CLI.
set -euo pipefail
# Resolve the repo root from this script's location so the smoke works from
# any checkout path (no hardcoded machine paths).
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
URLFILE="$REPO_ROOT/.pg-test/cli-url"
rm -f "$URLFILE"

node scripts/boot-cli-pg.mjs &
BOOTPID=$!
trap 'kill $BOOTPID 2>/dev/null || true' EXIT

for i in $(seq 1 60); do [ -f "$URLFILE" ] && break; sleep 0.5; done
PG_URL=$(cat "$URLFILE")

npx tsx infra/migrations/run.ts --url "$PG_URL"

IDEPOT_MIGRATION_PG_ADMIN_URL="$PG_URL" \
IDEPOT_MIGRATION_MYSQL_URL="${IDEPOT_MIGRATION_MYSQL_URL:-mysql://idepot_migration:idepot_migration_local@127.0.0.1:3307/idepot_legacy_staging}" \
IDEPOT_MIGRATION_ARTIFACTS_DIR="${IDEPOT_MIGRATION_ARTIFACTS_DIR:-$REPO_ROOT/migration-artifacts}" \
npx tsx packages/migration/src/cli.ts smoke --dump fixtures/legacy-mysql/idepot_phase1_fixture.sql

kill $BOOTPID 2>/dev/null || true
