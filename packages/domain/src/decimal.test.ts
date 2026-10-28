/**
 * Decimal-safe arithmetic tests — the foundation of "never floating-point
 * accounting math". Includes deterministic property sweeps (seeded LCG).
 */
import { describe, it, expect } from 'vitest';
import {
  QTY_SCALE,
  MONEY_SCALE,
  addScaled,
  cmpScaled,
  formatDecimal,
  halfEvenDiv,
  mulScaledExact,
  mulScaledRounded,
  parseDecimal,
  roundDecimal,
  subScaled,
} from '../src/decimal.js';
import {
  convertToBaseExact,
  legacyBaseQuantity,
  validateConversionFactor,
  validateMovementQuantity,
} from '../src/quantity.js';

/** deterministic 32-bit LCG so the property sweep is reproducible in CI */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('decimal parsing/formatting', () => {
  it('parses plain decimals into scaled integers and formats back', () => {
    expect(parseDecimal('120.5', QTY_SCALE)).toBe(120_500_000n);
    expect(parseDecimal('-0.000001', QTY_SCALE)).toBe(-1n);
    expect(parseDecimal('40', MONEY_SCALE)).toBe(400_000n);
    expect(formatDecimal(120_500_000n, QTY_SCALE)).toBe('120.500000');
    expect(formatDecimal(-1n, QTY_SCALE)).toBe('-0.000001');
  });

  it('rejects floats-by-string forms that would lose exactness', () => {
    expect(() => parseDecimal('1e3', QTY_SCALE)).toThrow(/plain decimal/);
    expect(() => parseDecimal('NaN', QTY_SCALE)).toThrow();
    expect(() => parseDecimal('Infinity', QTY_SCALE)).toThrow();
    expect(() => parseDecimal('1,000', QTY_SCALE)).toThrow();
    expect(() => parseDecimal('', QTY_SCALE)).toThrow();
    expect(() => parseDecimal(1.5 as unknown as string, QTY_SCALE)).toThrow(/must be a string/);
  });

  it('refuses excess precision instead of silently rounding', () => {
    expect(() => parseDecimal('0.1234567', QTY_SCALE)).toThrow(/round explicitly/);
  });

  it('rounds half-even explicitly when asked', () => {
    expect(roundDecimal('0.0000005', 7, QTY_SCALE)).toBe(0n); // 5 ties → even
    expect(roundDecimal('0.0000015', 7, QTY_SCALE)).toBe(2n); // 15 → 2
    expect(roundDecimal('0.0000025', 7, QTY_SCALE)).toBe(2n); // 25 → 2 (even)
    expect(roundDecimal('-0.0000015', 7, QTY_SCALE)).toBe(-2n);
  });
});

describe('half-even division', () => {
  it('rounds ties to even in both directions', () => {
    expect(halfEvenDiv(5n, 2n)).toBe(2n); // 2.5 → 2
    expect(halfEvenDiv(7n, 2n)).toBe(4n); // 3.5 → 4
    expect(halfEvenDiv(-5n, 2n)).toBe(-2n);
    expect(halfEvenDiv(-7n, 2n)).toBe(-4n);
    expect(halfEvenDiv(1n, 3n)).toBe(0n);
    expect(() => halfEvenDiv(1n, 0n)).toThrow();
    expect(() => halfEvenDiv(1n, -2n)).toThrow();
  });
});

describe('scaled arithmetic', () => {
  it('adds/subtracts across scales exactly', () => {
    expect(addScaled(1_500_000n, QTY_SCALE, 2n, 0)).toEqual({ value: 3_500_000n, scale: QTY_SCALE });
    expect(formatDecimal(addScaled(1_500_000n, QTY_SCALE, 2n, 0).value, QTY_SCALE)).toBe('3.500000');
    expect(subScaled(1n, 0, 500_000n, QTY_SCALE).value).toBe(500_000n);
    expect(formatDecimal(subScaled(1n, 0, 500_000n, QTY_SCALE).value, QTY_SCALE)).toBe('0.500000');
  });

  it('multiplies exactly only when the product terminates within target scale', () => {
    // 2.5 box × 12 pc/box = 30 pc exactly
    expect(mulScaledExact(2_500_000n, QTY_SCALE, 12_000_000n, QTY_SCALE, QTY_SCALE)).toBe(
      30_000_000n,
    );
    // 1 × 0.333333 (6dp factor) at scale 6 terminates fine...
    expect(mulScaledExact(1_000_000n, QTY_SCALE, 333_333n, QTY_SCALE, QTY_SCALE)).toBe(333_333n);
    // ...but halving it needs 7 dp → exact multiplication into 6dp impossible
    expect(() => mulScaledExact(500_000n, QTY_SCALE, 333_333n, QTY_SCALE, QTY_SCALE)).toThrow(
      /exact multiplication impossible/,
    );
    // integer × 6dp factor reduced to integer scale: 1 × 0.333333 → reject at scale 0
    expect(() => mulScaledExact(1n, 0, 333_333n, QTY_SCALE, 0)).toThrow(/exact multiplication impossible/);
  });

  it('offers a documented rounding path for legacy normalization', () => {
    expect(mulScaledRounded(1n, 0, 333_333n, QTY_SCALE, QTY_SCALE)).toBe(333_333n);
  });

  it('compares across scales', () => {
    expect(cmpScaled(1n, 0, 999_999n, QTY_SCALE)).toBe(1);
    expect(cmpScaled(0n, 0, 0n, 0)).toBe(0);
    expect(cmpScaled(1_000_000n, QTY_SCALE, 1n, 0)).toBe(0);
  });
});

describe('quantity validation', () => {
  it('rejects zero movements and negative counts', () => {
    expect(() => validateMovementQuantity('0')).toThrow(/non-zero/);
    expect(() => validateMovementQuantity('0.000000')).toThrow(/non-zero/);
    expect(validateMovementQuantity('-5')).toBe(-5_000_000n);
    expect(() => validateConversionFactor('0')).toThrow(/> 0/);
    expect(() => validateConversionFactor('-2')).toThrow(/> 0/);
    expect(() => validateConversionFactor('abc')).toThrow(/decimal\(18,6\)/);
    expect(validateConversionFactor('12')).toBe(12_000_000n);
  });
});

describe('conversion conservation (exactness required)', () => {
  it('converts box → pieces exactly', () => {
    expect(convertToBaseExact('2.5', '12')).toBe('30.000000');
    expect(convertToBaseExact('7', '12')).toBe('84.000000');
  });

  it('converts coil → yards and tonne → pieces', () => {
    expect(convertToBaseExact('3', '50')).toBe('150.000000'); // 3 coils × 50 yd
    expect(convertToBaseExact('0.25', '250')).toBe('62.500000'); // quarter tonne → 62.5 rods
  });

  it('converts carton → bottles → shots through chained factors', () => {
    expect(convertToBaseExact('2', '720')).toBe('1440.000000'); // 2 cartons = 1440 shots
    expect(convertToBaseExact('10', '30')).toBe('300.000000'); // 10 bottles = 300 shots
  });

  it('rejects conversions that cannot map losslessly onto the base pool', () => {
    // 0.5 piece × 0.333333 factor = 0.1666665 → 7 dp needed → reject
    expect(() => convertToBaseExact('0.5', '0.333333')).toThrow(/does not conserve base quantity exactly/);
    // 0.0000001 box (7dp) is not even a valid quantity at 6dp
    expect(() => convertToBaseExact('0.0000001', '12')).toThrow();
  });

  it('property sweep: exact products always conserve (deterministic seed)', () => {
    const rand = lcg(42);
    for (let i = 0; i < 400; i++) {
      // transacted: up to 3 dp; factor: integer 1..999 or 1dp
      const qtyInt = Math.floor(rand() * 1000);
      const qtyFrac = Math.floor(rand() * 1000); // 3 dp
      const factor = Math.floor(rand() * 999) + 1;
      const transacted = `${qtyInt}.${qtyFrac.toString().padStart(3, '0')}`;
      // ensure the product terminates at 6dp: factor integer × 3dp qty → ≤ 3+0 dp ✓
      const base = convertToBaseExact(transacted, String(factor));
      const expected = BigInt(qtyInt * factor * 1_000_000 + qtyFrac * factor * 1000);
      expect(parseDecimal(base, QTY_SCALE)).toBe(expected);
    }
  });
});

describe('legacy base reconstruction (I1 evidence math)', () => {
  it('reconstructs stored base from packages + loose units', () => {
    // 3 bundles × 10 + 5 pieces = 35 pieces
    expect(legacyBaseQuantity('3', '10', '5')).toBe('35.000000');
    // 2 coils × 50 + 13 yards = 113 yards
    expect(legacyBaseQuantity('2', '50', '13')).toBe('113.000000');
    // 2 cartons × 720 + 15 shots = 1455 shots
    expect(legacyBaseQuantity('2', '720', '15')).toBe('1455.000000');
    // no conversions: quantity is already base
    expect(legacyBaseQuantity('120.5', null, '0')).toBe('120.500000');
    expect(legacyBaseQuantity(null, null, null)).toBe('0.000000');
  });
});
