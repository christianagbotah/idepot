#!/usr/bin/env node
/**
 * Boots a standalone embedded PostgreSQL for CLI/tooling usage and stays alive.
 * Writes the admin URL to stdout file arg 1 (or .pg-test/cli-url). Exits on SIGTERM.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createServer } from 'node:net';

const out = process.argv[2] ?? '/home/z/my-project/idepot/.pg-test/cli-url';
mkdirSync(dirname(out), { recursive: true });
const dataDir = '/home/z/my-project/.pg-test/cli-data';
// disposable scratch cluster: always start fresh (initdb creates the dir itself)
if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
const port = await new Promise((resolve, reject) => {
  const srv = createServer();
  srv.unref();
  srv.on('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const a = srv.address();
    srv.close(() => resolve(a.port));
  });
});

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres_test',
  port,
  persistent: true,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('idepot_cli_smoke').catch(() => undefined);
const url = `postgresql://postgres:postgres_test@127.0.0.1:${port}/idepot_cli_smoke`;
writeFileSync(out, url);
process.stdout.write(`PG ready: ${url}\n`);

process.on('SIGTERM', async () => {
  await pg.stop();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await pg.stop();
  process.exit(0);
});
setInterval(() => undefined, 60_000); // keep alive
