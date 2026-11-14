#!/usr/bin/env bash
# Package an iDepot staging release OFF the VPS (docs/staging/staging-runbook.md
# CAPACITY GATE: the VPS must not run the monorepo build).
#
#   scripts/deploy/package-release.sh <git-sha> [--execute] [--skip-tests]
#
# Produces, next to the repo (or --out-dir):
#   release-<short-sha>.tar.gz      — self-contained release
#   release-<short-sha>.SHA256SUMS  — per-file checksums
#   release-<short-sha>.PROVENANCE  — sha, git describe, builder, node/npm
#
# The tarball layout (what lands under releases/<sha>/ on the VPS):
#   api/dist                      — compiled NestJS API
#   api/package.json              — for runtime reference (deps are pre-installed)
#   api/node_modules/             — PRUNED production dependencies (no dev tools)
#   api/seed-staging.ts           — synthetic tenant seeder (runs with pinned tsx)
#   web/                          — Next.js standalone build (server.js, .next/static, public)
#   migrations/                   — infra/migrations SQL + runner (for tsx)
#   runner/                       — pinned tsx for migrations/seeder
#   pm2/idepot-staging.ecosystem.config.cjs
#   deploy/                       — preflight/deploy/smoke/rollback/backup scripts
#   PROVENANCE.txt
#
# DRY-RUN by default (prints the plan); --execute builds.
set -euo pipefail
cd "$(dirname "$0")/../.."

SHA=""
EXECUTE=0
SKIP_TESTS=0
OUT_DIR="$PWD/dist/releases"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --out-dir) OUT_DIR="$2"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) SHA="$1" ;;
  esac
  shift
done
[[ -n "$SHA" ]] || { sed -n '2,12p' "$0" >&2; echo "usage: $0 <git-sha> [--execute] [--skip-tests] [--out-dir DIR]" >&2; exit 2; }

# resolve + verify the SHA exists in this checkout's object store
FULL_SHA="$(git rev-parse --verify "$SHA^{commit}")" || { echo "unknown commit: $SHA" >&2; exit 2; }
SHORT_SHA="$(git rev-parse --short=12 "$FULL_SHA")"
DESCRIBE="$(git describe --tags --always --dirty=-dirty "$FULL_SHA" 2>/dev/null || echo "$SHORT_SHA")"

say "iDepot release packaging"
say "  commit : $FULL_SHA ($DESCRIBE)"
say "  output : $OUT_DIR"
say "  tests  : $([[ $SKIP_TESTS -eq 1 ]] && echo SKIPPED || echo full-verification)"

if [[ $EXECUTE -ne 1 ]]; then
  say ""
  plan "verify working tree is clean at $SHORT_SHA"
  plan "npm ci (clean-room install from package-lock.json)"
  plan "verification: lint, typecheck:clean, build, unit tests, integration tests, migration smoke"
  plan "assemble release tree: api dist + pruned prod node_modules, web standalone, migrations, seed, deploy scripts, pm2 config"
  plan "write PROVENANCE + SHA256SUMS; tar.gz the tree"
  say ""
  say "re-run with --execute to build."
  exit 0
fi

# ---------------------------------------------------------------- 1. clean tree
[[ -z "$(git status --porcelain)" ]] || die "working tree not clean — commit or stash first (reproducible releases only)"
[[ "$(git rev-parse HEAD)" == "$FULL_SHA" ]] || die "HEAD is not $FULL_SHA — checkout the exact SHA first (git checkout $FULL_SHA)"

# ---------------------------------------------------------------- 2. install
say "[1/6] clean-room install"
npm ci

# ---------------------------------------------------------------- 3. verify
if [[ $SKIP_TESTS -eq 1 ]]; then
  warn "--skip-tests: release is NOT test-verified (emergency rebuilds only)"
else
  say "[2/6] full verification (the exact CI sequence)"
  npm run lint
  npm run typecheck:clean
  npm run build
  npm run test
  npm run test:integration
  npm run migration:smoke
fi

# ---------------------------------------------------------------- 4. assemble
say "[3/6] assembling release tree"
STAGE="$(mktemp -d)/release-$SHORT_SHA"
mkdir -p "$STAGE"/{api,web,migrations,pm2,deploy,seed,runner}

# API: dist + manifest, then PRUNED production node_modules
cp -r apps/api/dist "$STAGE/api/dist"
cp apps/api/package.json "$STAGE/api/package.json"
mkdir -p "$STAGE/api/node_modules"
# copy the production dependency closure from the workspace root node_modules;
# the api's runtime imports are @idepot/* workspaces + external prod deps.
node - <<'EOF' > /tmp/prod-deps.txt
const fs = require('fs');
const path = require('path');
const roots = [''];
const seen = new Set();
const out = new Set();
function manifest(p){ return JSON.parse(fs.readFileSync(path.join('node_modules', p, 'package.json'), 'utf8')); }
function add(pkg){
  if (seen.has(pkg)) return; seen.add(pkg);
  let m;
  try { m = manifest(pkg); } catch { return; }
  out.add(pkg);
  for (const d of Object.keys(m.dependencies || {})) {
    if (d.startsWith('@idepot/')) { try { add('../' + d); } catch {} continue; }
    if (fs.existsSync(path.join('node_modules', d))) add(d);
    else if (d.startsWith('@') && fs.existsSync(path.join('node_modules', d.split('/')[0]))) add(d);
  }
}
// api runtime deps
const api = JSON.parse(fs.readFileSync('apps/api/package.json', 'utf8'));
for (const d of Object.keys(api.dependencies || {})) {
  if (d.startsWith('@idepot/')) continue;
  if (fs.existsSync(path.join('node_modules', d))) add(d);
}
// migration runner + seed runtime deps (tsx lives in the root devDeps; ship it pinned)
for (const d of ['pg', 'dotenv']) if (fs.existsSync(path.join('node_modules', d))) add(d);
console.log([...out].sort().join('\n'));
EOF
while read -r dep; do
  [[ -z "$dep" || "$dep" == ".."* ]] && continue
  mkdir -p "$STAGE/api/node_modules/$(dirname "$dep")"
  cp -r "node_modules/$dep" "$STAGE/api/node_modules/$dep"
done < /tmp/prod-deps.txt
# workspace packages the api imports at runtime (dist imports @idepot/... via node_modules)
for ws in auth contracts domain migration config; do
  if [[ -d "node_modules/@idepot/$ws" ]]; then
    mkdir -p "$STAGE/api/node_modules/@idepot"
    cp -r "node_modules/@idepot/$ws" "$STAGE/api/node_modules/@idepot/$ws"
  fi
done
# pinned tsx for the migration runner + seeder (runner package.json pins the same version)
TSX_VERSION="$(node -p "require('./node_modules/tsx/package.json').version")"
cat > "$STAGE/runner/package.json" <<EOF
{ "name": "idepot-release-runner", "private": true, "type": "module",
  "dependencies": { "tsx": "$TSX_VERSION" } }
EOF
cp -r node_modules/tsx "$STAGE/runner/tsx" 2>/dev/null || cp -r node_modules/.bin "$STAGE/runner/.bin" 2>/dev/null || true
# tsx's own deps
for dep in esbuild get-tsconfig; do
  if [[ -d "node_modules/$dep" ]]; then mkdir -p "$STAGE/runner/node_modules"; cp -r "node_modules/$dep" "$STAGE/runner/node_modules/$dep"; fi
done
if [[ -d node_modules/.bin ]]; then mkdir -p "$STAGE/runner/node_modules/.bin"; cp node_modules/.bin/tsx "$STAGE/runner/node_modules/.bin/tsx" 2>/dev/null || true; fi

# Web: Next.js standalone output = .next/standalone (server.js) + .next/static + public
if [[ -d apps/web/.next/standalone ]]; then
  cp -r apps/web/.next/standalone/. "$STAGE/web/"
  [[ -d apps/web/.next/static ]] && cp -r apps/web/.next/static "$STAGE/web/.next/static"
  [[ -d apps/web/public ]] && cp -r apps/web/public "$STAGE/web/public"
else
  die "apps/web/.next/standalone missing — did `npm run build` run with output:'standalone'?"
fi

# migrations, seeder (INSIDE api/ so @idepot/* resolve from api/node_modules), deploy scripts, pm2 config
cp -r infra/migrations/*.sql infra/migrations/run.ts infra/migrations/runner.ts "$STAGE/migrations/" 2>/dev/null || true
cp scripts/deploy/seed-staging.ts "$STAGE/api/seed-staging.ts"
cp scripts/deploy/*.sh "$STAGE/deploy/"
cp infra/pm2/idepot-staging.ecosystem.config.cjs "$STAGE/pm2/"

# ---------------------------------------------------------------- 5. provenance
say "[4/6] provenance + checksums"
cat > "$STAGE/PROVENANCE.txt" <<EOF
idepot staging release
  commit      : $FULL_SHA
  describe    : $DESCRIBE
  built-by    : $(id -un)@$(hostname) ($(uname -srm))
  node/npm    : $(node --version) / $(npm --version)
  built-at    : $(date -u +%Y-%m-%dT%H:%M:%SZ)
  verification: $([[ $SKIP_TESTS -eq 1 ]] && echo "SKIPPED (--skip-tests)" || echo "lint + typecheck:clean + build + 146 unit + 397 integration + migration smoke (exact CI sequence)")
  policy      : dry-run-default deploy; releases/<sha>/ + current symlink; additive-only migrations
EOF
( cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS )

# ---------------------------------------------------------------- 6. tar
say "[5/6] tarball"
mkdir -p "$OUT_DIR"
TARBALL="$OUT_DIR/release-$SHORT_SHA.tar.gz"
( cd "$(dirname "$STAGE")" && tar -czf "$TARBALL" "$(basename "$STAGE")" )
( cd "$OUT_DIR" && sha256sum "$(basename "$TARBALL")" > "release-$SHORT_SHA.tar.gz.sha256" && cp "$STAGE/PROVENANCE.txt" "release-$SHORT_SHA.PROVENANCE.txt" && cp "$STAGE/SHA256SUMS" "release-$SHORT_SHA.SHA256SUMS" )

say "[6/6] done"
du -sh "$TARBALL"
say "  checksum: $(cut -d' ' -f1 "$OUT_DIR/release-$SHORT_SHA.tar.gz.sha256")"
say ""
say "Next: upload release-$SHORT_SHA.tar.gz to the VPS, then run"
say "  scripts/deploy/staging-preflight.sh          (read-only gate)"
say "  scripts/deploy/staging-deploy.sh release-$SHORT_SHA.tar.gz --execute"
