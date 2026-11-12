#!/usr/bin/env bash
# Shared helpers for the iDepot staging deploy scripts.
# Design rules (docs/staging/staging-runbook.md):
#   * dry-run by default; --execute required for any state change
#   * never `git reset --hard`, never rm -rf an ACTIVE release, never touch
#     other apps' files, never edit Webuzo's managed vhost config, never
#     delete backups
#   * every decision is printed before it is made
#
# shellcheck disable=SC2034  # constants are consumed by the SOURCING scripts
set -euo pipefail

# ---------------------------------------------------------------- constants
IDEPOT_APP_ROOT="${IDEPOT_APP_ROOT:-/home/lightworld/webapps/idepot-staging}"
IDEPOT_BACKUP_ROOT="${IDEPOT_BACKUP_ROOT:-/home/lightworld/backups/idepot-staging}"
IDEPOT_RELEASES_DIR="$IDEPOT_APP_ROOT/releases"
IDEPOT_CURRENT_LINK="$IDEPOT_APP_ROOT/current"
IDEPOT_PM2_API="idepot-staging-api"
IDEPOT_PM2_WEB="idepot-staging-web"
IDEPOT_WEB_PORT="${IDEPOT_WEB_PORT:-4310}"
IDEPOT_API_PORT="${IDEPOT_API_PORT:-4311}"
IDEPOT_PG_ROLE="${IDEPOT_PG_ROLE:-idepot_staging}"
IDEPOT_PG_DB="${IDEPOT_PG_DB:-idepot_staging}"
IDEPOT_RELEASES_KEEP="${IDEPOT_RELEASES_KEEP:-5}"
IDEPOT_BACKUPS_KEEP="${IDEPOT_BACKUPS_KEEP:-14}"
# CAPACITY GATE (staging-runbook.md): the 2026-11-12 inspection found the VPS
# at 90% disk with swap exhausted. Both must clear these thresholds.
IDEPOT_MIN_FREE_GB="${IDEPOT_MIN_FREE_GB:-20}"
IDEPOT_MAX_DISK_PCT="${IDEPOT_MAX_DISK_PCT:-85}"
IDEPOT_DEPOT1_DIR="${IDEPOT_DEPOT1_DIR:-/home/lightworld/webapps/depot1}"

# ------------------------------------------------------------------ helpers
DRY_RUN=1
if [[ "${1:-}" == "--execute" ]]; then DRY_RUN=0; fi

say()  { printf '%s\n' "$*"; }
plan() { printf '[PLAN] %s\n' "$*"; }
doit() { if [[ $DRY_RUN -eq 1 ]]; then printf '[DRY-RUN] %s\n' "$*"; else printf '[EXEC] %s\n' "$*"; eval "$*"; fi }
ok()   { printf '[OK] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
die()  { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

require_root_or_sudo() {
  if [[ $EUID -ne 0 && -z "$(command -v sudo || true)" ]]; then
    die "need root or sudo for this step (run as the deploy user with sudo)"
  fi
}

# sudo wrapper that stays a no-op dry-run print
run_sudo() {
  doit "sudo $*"
}

# usage header shared by all staging scripts
usage_banner() {
  say "Usage: $0 [--execute]"
  say "  Default is DRY-RUN: prints the plan and exits 0 without changing anything."
  say "  --execute  actually perform the steps (requires operator confirmation)."
}
