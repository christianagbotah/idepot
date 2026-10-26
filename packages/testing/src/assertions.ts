import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { expect } from 'vitest';

/** Assert a query returned exactly one row and return it. */
export function expectOneRow<T extends QueryResultRow>(result: QueryResult<T>): T {
  expect(result.rowCount, `expected exactly 1 row, got ${result.rowCount}`).toBe(1);
  return result.rows[0] as T;
}

/** Assert a query returned zero rows. */
export function expectNoRows<T extends QueryResultRow>(result: QueryResult<T>): void {
  expect(result.rowCount, `expected 0 rows, got ${result.rowCount}`).toBe(0);
}

/** Assert table row count. */
export async function expectTableCount(
  client: PoolClient | { query: PoolClient['query'] },
  table: string,
  expected: number,
): Promise<void> {
  const res = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`);
  expect(Number(res.rows[0]?.n)).toBe(expected);
}

/** Assert table is empty. */
export async function expectTableEmpty(
  client: PoolClient | { query: PoolClient['query'] },
  table: string,
): Promise<void> {
  await expectTableCount(client, table, 0);
}

/**
 * Exact numeric(18,4) equality as strings — never float compares for money.
 */
export function expectDecimalEqual(actual: string | null, expected: string): void {
  expect(actual, `expected ${expected}, got ${actual}`).not.toBeNull();
  expect(normalizeDecimal(actual as string)).toBe(normalizeDecimal(expected));
}

function normalizeDecimal(value: string): string {
  const [int, frac = ''] = value.trim().replace(/^\+/, '').split('.');
  const f = (frac + '0000').slice(0, 4);
  return `${int === '-0' ? '0' : int}.${f}`;
}
