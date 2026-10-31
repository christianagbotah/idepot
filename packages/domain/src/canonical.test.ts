/**
 * Canonical JSON + sync event fingerprint unit tests (review finding #5).
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson, fingerprint, syncEventFingerprint } from './canonical.js';

describe('canonicalJson', () => {
  it('object key order is irrelevant', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorting is recursive and deterministic', () => {
    const a = { z: { y: 1, x: 2 }, a: [{ n: 1, m: 2 }, 3] };
    const b = { a: [{ m: 2, n: 1 }, 3], z: { x: 2, y: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('arrays keep their order (order is meaning)', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('strings, numbers, booleans, null serialize stably', () => {
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
    expect(canonicalJson(1.5)).toBe('1.5');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('syncEventFingerprint', () => {
  it('same type + same payload (any key order) → same fingerprint', () => {
    const a = syncEventFingerprint('sale.create', { lines: [{ productId: 'p1', qty: 2 }], note: 'x' });
    const b = syncEventFingerprint('sale.create', { note: 'x', lines: [{ qty: 2, productId: 'p1' }] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('DIFFERENT payload → different fingerprint (the idempotency contract)', () => {
    const a = syncEventFingerprint('sale.create', { amount: '10.0000' });
    const b = syncEventFingerprint('sale.create', { amount: '11.0000' });
    expect(a).not.toBe(b);
  });

  it('different event type with identical payload → different fingerprint', () => {
    const p = { amount: '10.0000' };
    expect(syncEventFingerprint('sale.create', p)).not.toBe(syncEventFingerprint('payment.receive', p));
  });

  it('fingerprint is stable across calls (persisted rows must match)', () => {
    const p = { deep: { nested: [1, 'two', false, null] } };
    expect(fingerprint(p)).toBe(fingerprint(p));
  });
});
