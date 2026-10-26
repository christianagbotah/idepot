import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const srcAlias = (pkg: string) => resolve(__dirname, `packages/${pkg}/src/index.ts`);

export default defineConfig({
  resolve: {
    alias: {
      '@idepot/testing': srcAlias('testing'),
      '@idepot/domain': srcAlias('domain'),
      '@idepot/auth': srcAlias('auth'),
      '@idepot/contracts': srcAlias('contracts'),
      '@idepot/migration': srcAlias('migration'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'infra/**/*.test.ts',
      'benchmarks/*/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    // Each integration test file boots its own database on the shared embedded PG.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    maxConcurrency: 2,
    fileParallelism: true,
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
  },
});
