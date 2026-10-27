#!/usr/bin/env node
/**
 * Regression guard for clean-checkout typechecking.
 *
 * Deletes EVERY generated build/test artifact (dist/, .next/, coverage/,
 * *.tsbuildinfo) across all workspaces, so that a subsequent
 * `npm run typecheck` proves the repository typechecks from source
 * (via tsconfig.typecheck.json path mappings) and does NOT silently
 * depend on stale build output left over from a previous `npm run build`.
 *
 * Never touches node_modules/, .git/ or any source file.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const GENERATED_DIRS = new Set(['dist', '.next', 'coverage', '.turbo']);
const TARGET_ROOTS = ['packages', 'apps', 'benchmarks', 'infra'];

/** Workspaces discovered from package.json globs (same contract as build-order.mjs). */
function workspaceDirs() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const dirs = [];
  for (const pattern of pkg.workspaces ?? []) {
    const base = join(root, pattern.replace(/\/\*$/, ''));
    if (!pattern.endsWith('/*') || !existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(base, entry.name, 'package.json'))) {
        dirs.push(join(base, entry.name));
      }
    }
  }
  return dirs;
}

function cleanDir(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (GENERATED_DIRS.has(entry.name)) {
        rmSync(p, { recursive: true, force: true });
        process.stdout.write(`  removed ${p}\n`);
      }
    } else if (entry.name.endsWith('.tsbuildinfo')) {
      rmSync(p, { force: true });
      process.stdout.write(`  removed ${p}\n`);
    }
  }
}

process.stdout.write(`Cleaning generated artifacts under ${root}\n`);
for (const base of TARGET_ROOTS) {
  const baseDir = join(root, base);
  if (!existsSync(baseDir) || !statSync(baseDir).isDirectory()) continue;
  cleanDir(baseDir);
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (entry.isDirectory()) cleanDir(join(baseDir, entry.name));
  }
}
for (const ws of workspaceDirs()) cleanDir(ws);
process.stdout.write('Clean.\n');
