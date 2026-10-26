import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

/**
 * Module boundary rules (enforced architecture, not convention):
 * - packages/domain: framework-free (no NestJS, no DB/driver, no HTTP, no Next).
 * - packages/contracts: transport-neutral; no NestJS/Next, no DB drivers.
 * - packages/auth: framework-free core (no NestJS decorators), crypto libs allowed.
 * - packages/migration: standalone CLI leaf; no NestJS/Next, no app imports.
 * - apps/api: business code may NOT import migration internals (migration is a CLI leaf)
 *   and must not import apps/web.
 */
const FRAMEWORKS = ['@nestjs', 'next', 'express'];
const DB_DRIVERS = ['pg', 'typeorm', 'kysely', 'mysql2', '@prisma'];

const boundaries = [
  {
    files: ['packages/domain/**/*.ts'],
    name: 'domain/no-frameworks',
    groups: [...FRAMEWORKS, ...DB_DRIVERS],
  },
  {
    files: ['packages/contracts/**/*.ts'],
    name: 'contracts/no-frameworks',
    groups: [...FRAMEWORKS, ...DB_DRIVERS],
  },
  {
    files: ['packages/auth/**/*.ts'],
    name: 'auth/no-frameworks',
    groups: FRAMEWORKS.filter((g) => g !== 'next'),
  },
  {
    files: ['packages/migration/**/*.ts'],
    name: 'migration/no-frameworks',
    groups: ['@nestjs'],
  },
  {
    files: ['apps/api/**/*.ts'],
    name: 'api/no-migration-internals',
    groups: ['@idepot/migration'],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    name: 'web/no-db',
    groups: DB_DRIVERS,
  },
];

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/src/generated/**',
      '**/.next/**',
      'legacy/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...prettier.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-imports': 'off',
    },
  },
  ...boundaries.map((b) => ({
    files: b.files,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: b.groups.map((g) => ({
            group: [`${g}`, `${g}/*`],
            message: `Module boundary violation (${b.name}).`,
          })),
        },
      ],
    },
  })),
];
