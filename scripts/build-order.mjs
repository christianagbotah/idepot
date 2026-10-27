#!/usr/bin/env node
/**
 * Topological build driver for npm workspaces (no turbo/nx dependency).
 * Order is derived from declared @idepot/* dependencies in each package.json.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const workspaces = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces;

function workspaceDirs() {
  const dirs = [];
  for (const pattern of workspaces) {
    const base = pattern.replace(/\/\*$/, '');
    if (pattern.endsWith('/*') && existsSync(base)) {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(base, entry.name, 'package.json'))) {
          dirs.push(join(base, entry.name));
        }
      }
    }
  }
  return dirs;
}

function pkgInfo(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) =>
    d.startsWith('@idepot/'),
  );
  return { dir, name: pkg.name, scripts: pkg.scripts ?? {}, deps };
}

const infos = workspaceDirs().map(pkgInfo);
const byName = new Map(infos.map((i) => [i.name, i]));

const order = [];
const visiting = new Set();
const done = new Set();

function visit(info) {
  if (done.has(info.name)) return;
  if (visiting.has(info.name)) throw new Error(`dependency cycle at ${info.name}`);
  visiting.add(info.name);
  for (const dep of info.deps) {
    const target = byName.get(dep);
    if (target) visit(target);
  }
  visiting.delete(info.name);
  done.add(info.name);
  order.push(info);
}

infos.forEach(visit);

const only = process.argv.slice(2);
for (const info of order) {
  if (only.length && !only.includes(info.name)) continue;
  if (!info.scripts.build) continue;
  process.stdout.write(`> build ${info.name}\n`);
  execSync(`npm run build --workspace=${info.name}`, { stdio: 'inherit', cwd: root });
}
