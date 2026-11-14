/**
 * Phase 7a intelligence rule evaluators — pure-function tests. Every rule
 * decision (thresholds, severities, dedupe keys, evidence) is proven here
 * against hand-computed cases; the integration suite proves the SQL
 * loaders and the queue semantics on a real database.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTELLIGENCE_CONFIG,
  evaluateAdjustmentAnomaly,
  evaluateAfterHours,
  evaluateDeadStock,
  evaluateDiscountAnomaly,
  evaluateDuplicateParties,
  evaluateDuplicateProducts,
  evaluateReversalActivity,
  evaluateShiftVariance,
  evaluateStockoutRisk,
  evaluateVoidedInvoice,
  normalizeAddressKey,
  normalizeNameTokens,
  normalizePhoneGh,
  resolveIntelligenceConfig,
  tokenSetOverlap,
  type PartyDuplicateRecord,
  type ProductDuplicateRecord,
} from './intelligence.js';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

const stockInput = (over: Partial<Parameters<typeof evaluateDeadStock>[0]>) => ({
  productId: 'p-1',
  productCode: 'SKU-1',
  productName: 'Test Product',
  warehouseId: 'w-1',
  warehouseCode: 'WH1',
  onHandBase: '10.000000',
  lastIssueAt: daysAgo(10),
  firstReceiptAt: daysAgo(100),
  issuesInWindow: '2.000000',
  ...over,
});

describe('resolveIntelligenceConfig', () => {
  it('returns defaults for null/absent payloads', () => {
    expect(resolveIntelligenceConfig(null)).toEqual(DEFAULT_INTELLIGENCE_CONFIG);
    expect(resolveIntelligenceConfig(undefined)).toEqual(DEFAULT_INTELLIGENCE_CONFIG);
    expect(resolveIntelligenceConfig('nonsense')).toEqual(DEFAULT_INTELLIGENCE_CONFIG);
  });

  it('overrides known keys and ignores unknown ones', () => {
    const cfg = resolveIntelligenceConfig({
      deadStock: { noSaleDays: 14 },
      stockoutRisk: { leadTimeDays: 3 },
      anomaly: { discountWarnRatio: 0.05 },
      unknownSection: { nope: 1 },
    });
    expect(cfg.deadStock.noSaleDays).toBe(14);
    expect(cfg.deadStock.velocityWindowDays).toBe(90); // untouched default
    expect(cfg.stockoutRisk.leadTimeDays).toBe(3);
    expect(cfg.anomaly.discountWarnRatio).toBe(0.05);
  });

  it('rejects non-numeric and negative values (keeps defaults)', () => {
    const cfg = resolveIntelligenceConfig({
      anomaly: { discountWarnRatio: 'half' as unknown as number, shiftVarianceWarn: -5 },
    });
    expect(cfg.anomaly.discountWarnRatio).toBe(0.1);
    expect(cfg.anomaly.shiftVarianceWarn).toBe(50);
  });

  it('never lets a critical threshold fall below its warning threshold', () => {
    const cfg = resolveIntelligenceConfig({ anomaly: { shiftVarianceCritical: 10 } });
    expect(cfg.anomaly.shiftVarianceCritical).toBe(cfg.anomaly.shiftVarianceWarn);
  });

  it('duplicate section: overrides, clamps into [0,1] and keeps high ≥ warn', () => {
    const cfg = resolveIntelligenceConfig({ duplicate: { nameSimilarityWarn: 0.7, nameSimilarityHigh: 1.5 } });
    expect(cfg.duplicate.nameSimilarityWarn).toBe(0.7);
    expect(cfg.duplicate.nameSimilarityHigh).toBe(1); // clamped, still ≥ warn
    const inverted = resolveIntelligenceConfig({ duplicate: { nameSimilarityWarn: 0.9, nameSimilarityHigh: 0.5 } });
    expect(inverted.duplicate.nameSimilarityHigh).toBe(inverted.duplicate.nameSimilarityWarn);
    expect(resolveIntelligenceConfig(null).duplicate).toEqual({ nameSimilarityWarn: 0.85, nameSimilarityHigh: 0.9 });
  });
});

describe('evaluateDeadStock', () => {
  it('alerts when the last sale is older than the threshold', () => {
    const d = evaluateDeadStock(stockInput({ lastIssueAt: daysAgo(61) }), DEFAULT_INTELLIGENCE_CONFIG, NOW);
    expect(d).not.toBeNull();
    expect(d!.ruleId).toBe('dead-stock');
    expect(d!.severity).toBe('warning');
    expect(d!.dedupeKey).toBe('dead-stock:p-1:w-1');
    expect(d!.evidence.daysSinceLastIssue).toBe(61);
  });

  it('escalates to critical at twice the threshold', () => {
    const d = evaluateDeadStock(stockInput({ lastIssueAt: daysAgo(120) }), DEFAULT_INTELLIGENCE_CONFIG, NOW);
    expect(d!.severity).toBe('critical');
  });

  it('stays silent inside the threshold', () => {
    expect(evaluateDeadStock(stockInput({ lastIssueAt: daysAgo(59) }), DEFAULT_INTELLIGENCE_CONFIG, NOW)).toBeNull();
  });

  it('ignores products with no stock on the shelf', () => {
    expect(evaluateDeadStock(stockInput({ onHandBase: '0.000000' }), DEFAULT_INTELLIGENCE_CONFIG, NOW)).toBeNull();
  });

  it('never-sold products anchor to the first receipt, not to today', () => {
    // stock arrived 30 days ago, never sold — below the 60d threshold: silent
    expect(
      evaluateDeadStock(stockInput({ lastIssueAt: null, firstReceiptAt: daysAgo(30) }), DEFAULT_INTELLIGENCE_CONFIG, NOW),
    ).toBeNull();
    // stock arrived 90 days ago, never sold: alert
    const d = evaluateDeadStock(
      stockInput({ lastIssueAt: null, firstReceiptAt: daysAgo(90) }),
      DEFAULT_INTELLIGENCE_CONFIG,
      NOW,
    );
    expect(d).not.toBeNull();
    expect(d!.evidence.neverSold).toBe(true);
    expect(d!.evidence.daysSinceFirstReceipt).toBe(90);
  });
});

describe('evaluateStockoutRisk', () => {
  const si = (over: Partial<Parameters<typeof evaluateStockoutRisk>[0]>) => ({
    productId: 'p-1',
    productCode: 'SKU-1',
    productName: 'Test Product',
    warehouseId: 'w-1',
    warehouseCode: 'WH1',
    onHandBase: '10.000000',
    demandInWindow: '30.000000',
    soldInWindow: true,
    ...over,
  });

  it('critical when stocked out while demonstrably selling', () => {
    const d = evaluateStockoutRisk(si({ onHandBase: '0.000000' }), DEFAULT_INTELLIGENCE_CONFIG);
    expect(d!.severity).toBe('critical');
    expect(d!.ruleId).toBe('stockout-risk');
    expect(d!.evidence.daysOfCover).toBe(0);
  });

  it('warning when days of cover fall below the lead time', () => {
    // 10 on hand, 30 sold in 30 days -> 1/day -> 10 days cover > 7d lead time: silent
    expect(evaluateStockoutRisk(si({}), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
    // 60 sold in 30 days -> 2/day -> 5 days cover < 7d lead time: warning
    const d = evaluateStockoutRisk(si({ demandInWindow: '60.000000' }), DEFAULT_INTELLIGENCE_CONFIG);
    expect(d!.severity).toBe('warning');
    expect(d!.evidence.daysOfCover).toBe(5);
  });

  it('exact boundary: cover == lead time does not alert (shortfall is strict)', () => {
    // 7 days of cover exactly == lead time -> onHand*window == demand*lead: no alert
    expect(evaluateStockoutRisk(si({ demandInWindow: '30.000000', onHandBase: '7.000000' }), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
  });

  it('silent when there is no demand evidence', () => {
    expect(
      evaluateStockoutRisk(si({ demandInWindow: '0.000000', soldInWindow: false, onHandBase: '0.000000' }), DEFAULT_INTELLIGENCE_CONFIG),
    ).toBeNull();
  });

  it('decimal demand works exactly (no float threshold crossing)', () => {
    // 0.5/day -> 3.5 on hand covers exactly 7 days: silent
    expect(
      evaluateStockoutRisk(si({ demandInWindow: '15.000000', onHandBase: '3.500000' }), DEFAULT_INTELLIGENCE_CONFIG),
    ).toBeNull();
    // 3.499999 on hand is short of 7 days: warning
    const d = evaluateStockoutRisk(si({ demandInWindow: '15.000000', onHandBase: '3.499999' }), DEFAULT_INTELLIGENCE_CONFIG);
    expect(d!.severity).toBe('warning');
  });
});

describe('evaluateDiscountAnomaly', () => {
  const di = (over: Partial<Parameters<typeof evaluateDiscountAnomaly>[0]>) => ({
    invoiceId: 'i-1',
    invoiceCode: 'INV-1',
    subtotal: '100.0000',
    orderDiscount: '0.0000',
    createdByName: 'Cashier One',
    businessDate: '2026-11-14',
    ...over,
  });

  it('warns at the configured ratio boundary (inclusive)', () => {
    const d = evaluateDiscountAnomaly(di({ orderDiscount: '10.0000' }), DEFAULT_INTELLIGENCE_CONFIG);
    expect(d!.severity).toBe('warning');
    expect(d!.ruleId).toBe('anomaly:invoice-discount');
    expect(d!.dedupeKey).toBe('anomaly:discount:i-1');
  });

  it('critical beyond the critical ratio', () => {
    expect(evaluateDiscountAnomaly(di({ orderDiscount: '25.0000' }), DEFAULT_INTELLIGENCE_CONFIG)!.severity).toBe('critical');
    expect(evaluateDiscountAnomaly(di({ orderDiscount: '24.9999' }), DEFAULT_INTELLIGENCE_CONFIG)!.severity).toBe('warning');
  });

  it('silent below the threshold and on zero-discount invoices', () => {
    expect(evaluateDiscountAnomaly(di({ orderDiscount: '9.9999' }), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
    expect(evaluateDiscountAnomaly(di({}), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
  });

  it('guards zero subtotals', () => {
    expect(evaluateDiscountAnomaly(di({ subtotal: '0.0000', orderDiscount: '0.0000' }), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
  });
});

describe('evaluateAfterHours', () => {
  const ai = (hourUtc: number) => ({
    invoiceId: 'i-1',
    invoiceCode: 'INV-1',
    occurredAt: new Date(`2026-11-14T${String(hourUtc).padStart(2, '0')}:30:00.000Z`),
    createdByName: 'Cashier One',
    businessDate: '2026-11-14',
  });

  it('alerts outside the operating window', () => {
    const d = evaluateAfterHours(ai(2), DEFAULT_INTELLIGENCE_CONFIG);
    expect(d!.ruleId).toBe('anomaly:after-hours');
    expect(d!.severity).toBe('info');
    expect(d!.evidence.hourUtc).toBe(2);
  });

  it('silent inside the window, including boundaries (6 inclusive, 21 exclusive)', () => {
    expect(evaluateAfterHours(ai(6), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
    expect(evaluateAfterHours(ai(20), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
    expect(evaluateAfterHours(ai(21), DEFAULT_INTELLIGENCE_CONFIG)).not.toBeNull();
  });
});

describe('evaluateShiftVariance', () => {
  const sh = (variance: string) => ({
    shiftId: 's-1',
    shiftCode: 'SH-1',
    cashierName: 'Cashier One',
    expectedCash: '500.0000',
    countedCash: (500 - Number(variance)).toFixed(4),
    variance,
    closedAt: NOW,
  });

  it('warns at the band boundary (inclusive, magnitude)', () => {
    expect(evaluateShiftVariance(sh('50.0000'), DEFAULT_INTELLIGENCE_CONFIG)!.severity).toBe('warning');
    expect(evaluateShiftVariance(sh('-50.0000'), DEFAULT_INTELLIGENCE_CONFIG)!.severity).toBe('warning');
  });

  it('critical beyond the critical band', () => {
    expect(evaluateShiftVariance(sh('-200.0000'), DEFAULT_INTELLIGENCE_CONFIG)!.severity).toBe('critical');
  });

  it('silent inside the band', () => {
    expect(evaluateShiftVariance(sh('49.9999'), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
    expect(evaluateShiftVariance(sh('-12.5000'), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
  });
});

describe('evaluateAdjustmentAnomaly', () => {
  const adj = (qty: string) => ({
    adjustmentLineId: 'l-1',
    adjustmentCode: 'ADJ-1',
    adjustedAt: NOW,
    productCode: 'SKU-1',
    productName: 'Test Product',
    quantityBase: qty,
    reason: 'damage',
    createdByName: 'Manager One',
  });

  it('warns and goes critical by magnitude (sign-agnostic)', () => {
    expect(evaluateAdjustmentAnomaly(adj('20.000000'), DEFAULT_INTELLIGENCE_CONFIG)!.severity).toBe('warning');
    expect(evaluateAdjustmentAnomaly(adj('-100.000000'), DEFAULT_INTELLIGENCE_CONFIG)!.severity).toBe('critical');
    expect(evaluateAdjustmentAnomaly(adj('19.999999'), DEFAULT_INTELLIGENCE_CONFIG)).toBeNull();
  });

  it('evidence flags a missing reason explicitly', () => {
    const d = evaluateAdjustmentAnomaly({ ...adj('-25.000000'), reason: null }, DEFAULT_INTELLIGENCE_CONFIG);
    expect(d!.reason).toContain('NO stated reason');
    expect(d!.evidence.reason).toBeNull();
  });
});

describe('voided / reversal surfaces', () => {
  it('voided invoices always surface as info', () => {
    const d = evaluateVoidedInvoice({
      invoiceId: 'i-9',
      invoiceCode: 'INV-9',
      businessDate: '2026-11-14',
      total: '40.0000',
      createdByName: 'Cashier One',
    });
    expect(d!.ruleId).toBe('anomaly:invoice-voided');
    expect(d!.severity).toBe('info');
  });

  it('reversals surface with their documented reason', () => {
    const d = evaluateReversalActivity({
      reversalId: 'r-9',
      invoiceCode: 'INV-9',
      reversalDate: '2026-11-14',
      total: '40.0000',
      reason: 'wrong customer captured at till',
      createdByName: 'Manager One',
    });
    expect(d!.ruleId).toBe('anomaly:invoice-reversal');
    expect(d!.reason).toContain('wrong customer captured at till');
  });
});

describe('duplicate-detection normalizers (Ghana-exact, deterministic)', () => {
  it('normalizePhoneGh folds every common Ghana spelling onto one key', () => {
    expect(normalizePhoneGh('0244123456')).toBe('244123456');
    expect(normalizePhoneGh('+233 24 412 3456')).toBe('244123456');
    expect(normalizePhoneGh('233-24-412-3456')).toBe('244123456');
    expect(normalizePhoneGh('(024) 412-3456')).toBe('244123456');
  });

  it('normalizePhoneGh refuses matchless garbage', () => {
    expect(normalizePhoneGh('12345')).toBeNull();
    expect(normalizePhoneGh('')).toBeNull();
    expect(normalizePhoneGh(null)).toBeNull();
    expect(normalizePhoneGh('00493012345678')).toBeNull(); // foreign length
  });

  it('normalizeNameTokens strips punctuation, case and diacritics; word order is irrelevant (set semantics)', () => {
    expect(normalizeNameTokens('Coca-Cola 300ml')).toEqual(['coca', 'cola', '300ml']);
    expect(normalizeNameTokens('Ama  Serwaa.')).toEqual(['ama', 'serwaa']);
    expect(normalizeNameTokens('Béatrice & Co.')).toEqual(['beatrice', 'co']);
    expect(normalizeNameTokens('fanMILK')).toEqual(['fanmilk']);
    expect(normalizeNameTokens('   ')).toEqual([]);
    expect(normalizeAddressKey('12 Makola Rd., Accra')).toBe('12 makola rd accra');
    expect(normalizeAddressKey(null)).toBeNull();
  });

  it('tokenSetOverlap is exact integer counting', () => {
    expect(tokenSetOverlap(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({ inter: 3, union: 3 });
    expect(tokenSetOverlap(['a', 'b'], ['b', 'c'])).toEqual({ inter: 1, union: 3 });
    expect(tokenSetOverlap([], ['x'])).toEqual({ inter: 0, union: 1 });
    // repeated tokens collapse to the set: {a} vs {a}
    expect(tokenSetOverlap(['a', 'a'], ['a'])).toEqual({ inter: 1, union: 1 });
  });
});

const party = (over: Partial<PartyDuplicateRecord>): PartyDuplicateRecord => ({
  id: 'id-a',
  code: 'CUS-A',
  name: 'Ama Serwaa',
  phone: '0244123456',
  altPhone: null,
  address: '12 Makola Rd, Accra',
  isGuest: false,
  createdAt: NOW,
  ...over,
});

describe('evaluateDuplicateParties (feature 15, tier 7a)', () => {
  it('critical: shared phone key AND similar names', () => {
    const d = evaluateDuplicateParties(
      party({ id: 'id-a', code: 'CUS-A', createdAt: NOW }),
      party({ id: 'id-b', code: 'CUS-B', name: 'Ama  Serwaa.', phone: '+233 24 412 3456', createdAt: new Date(NOW.getTime() - 1000) }),
      DEFAULT_INTELLIGENCE_CONFIG,
      'customer',
    );
    expect(d!.ruleId).toBe('duplicate:customer');
    expect(d!.severity).toBe('critical');
    expect(d!.entityId).toBe('id-a'); // the NEWER record is the probable duplicate
    expect(d!.evidence.signals).toContain('phone');
    expect(d!.evidence.sharedPhoneKey).toBe('244123456');
    expect((d!.evidence.nameSimilarity as { ratioPct: number }).ratioPct).toBe(100);
  });

  it('warning: shared phone key alone (a shared household line is possible)', () => {
    const d = evaluateDuplicateParties(
      party({ name: 'Ama Serwaa' }),
      party({ id: 'id-b', code: 'CUS-B', name: 'Completely Different Person', phone: '0244123456', address: 'elsewhere' }),
      DEFAULT_INTELLIGENCE_CONFIG,
      'customer',
    );
    expect(d!.severity).toBe('warning');
    expect(d!.evidence.addressMatch).toBe(false);
  });

  it('warning: highly similar names AND identical address, distinct phones', () => {
    const d = evaluateDuplicateParties(
      party({}),
      party({ id: 'id-b', code: 'CUS-B', name: 'ama SERWAA', phone: '0209998877', address: '12 makola rd, ACCRA' }),
      DEFAULT_INTELLIGENCE_CONFIG,
      'customer',
    );
    expect(d!.severity).toBe('warning');
    expect(d!.evidence.addressMatch).toBe(true);
    expect(d!.evidence.signals).toEqual(['name', 'address']);
  });

  it('info: similar names only — common names deserve eyes, not alarms', () => {
    const d = evaluateDuplicateParties(
      party({}),
      party({ id: 'id-b', code: 'CUS-B', name: 'Ama Serwaa', phone: '0209998877', address: null }),
      DEFAULT_INTELLIGENCE_CONFIG,
      'customer',
    );
    expect(d!.severity).toBe('info');
  });

  it('silent below the similarity band, even with a shared address', () => {
    // {ama,serwaa} vs {ama,serwaa,owusu} = 2/3 = 0.667 < 0.85
    expect(
      evaluateDuplicateParties(
        party({}),
        party({ id: 'id-b', code: 'CUS-B', name: 'Ama Serwaa Owusu', phone: '0209998877', address: '12 makola rd accra' }),
        DEFAULT_INTELLIGENCE_CONFIG,
        'customer',
      ),
    ).toBeNull();
  });

  it('guest customers never participate (walk-in capture is legitimately repetitive)', () => {
    expect(
      evaluateDuplicateParties(
        party({}),
        party({ id: 'id-b', code: 'CUS-B', isGuest: true }),
        DEFAULT_INTELLIGENCE_CONFIG,
        'customer',
      ),
    ).toBeNull();
  });

  it('dedupe key is the canonical sorted pair — argument order and newness cannot double-report', () => {
    const newer = party({ id: 'id-z', code: 'CUS-Z', createdAt: NOW });
    const older = party({ id: 'id-a', code: 'CUS-A', createdAt: new Date(NOW.getTime() - 5_000) });
    const one = evaluateDuplicateParties(newer, older, DEFAULT_INTELLIGENCE_CONFIG, 'supplier');
    const two = evaluateDuplicateParties(older, newer, DEFAULT_INTELLIGENCE_CONFIG, 'supplier');
    expect(one!.dedupeKey).toBe('duplicate:supplier:id-a:id-z');
    expect(two!.dedupeKey).toBe(one!.dedupeKey);
    expect(one!.entityId).toBe('id-z'); // newer
    expect(one!.entityType).toBe('supplier');
  });

  it('alt-phone overlap counts as a phone signal', () => {
    const d = evaluateDuplicateParties(
      party({ phone: '0302111222', name: 'Accra Beverages Ltd' }),
      party({ id: 'id-b', code: 'CUS-B', phone: '0550000000', altPhone: '0302-111-222', name: 'accra beverages LTD' }),
      DEFAULT_INTELLIGENCE_CONFIG,
      'supplier',
    );
    expect(d!.severity).toBe('critical'); // shared phone (via alt) + identical names
    expect(d!.ruleId).toBe('duplicate:supplier');
  });
});

const product = (over: Partial<ProductDuplicateRecord>): ProductDuplicateRecord => ({
  id: 'id-a',
  code: 'PRD-A',
  name: 'Coca-Cola 300ml',
  brandName: 'Coca-Cola',
  categoryName: 'Soft Drinks',
  sellingPrice: '5.0000',
  createdAt: NOW,
  ...over,
});

describe('evaluateDuplicateProducts (feature 15, tier 7a)', () => {
  it('warning on identical normalized names (case/punctuation/word-order insensitive)', () => {
    const d = evaluateDuplicateProducts(
      product({}),
      product({ id: 'id-b', code: 'PRD-B', name: 'coca cola 300ml', createdAt: new Date(NOW.getTime() - 1000) }),
      DEFAULT_INTELLIGENCE_CONFIG,
    );
    expect(d!.ruleId).toBe('duplicate:product');
    expect(d!.severity).toBe('warning');
    expect(d!.evidence.exactNameMatch).toBe(true);
    expect(d!.entityId).toBe('id-a'); // newer
    expect(d!.dedupeKey).toBe('duplicate:product:id-a:id-b');
  });

  it('info in the near-identical band (subset names: 6 shared / 7 total = 85.7% ≥ 85%)', () => {
    const d = evaluateDuplicateProducts(
      product({ name: 'Fan Milk Chocolate Ice Cream 450ml Tub' }),
      product({ id: 'id-b', code: 'PRD-B', name: 'Fan Milk Ice Cream 450ml Tub' }),
      DEFAULT_INTELLIGENCE_CONFIG,
    );
    expect(d!.severity).toBe('info');
    expect(d!.evidence.nameSimilarity).toEqual({ sharedTokens: 6, totalTokens: 7, ratioPct: 85.7 });
  });

  it('silent below the band (4/5 = 80%) and on empty names', () => {
    expect(
      evaluateDuplicateProducts(
        product({ name: 'Fanta Orange 500ml Bottle' }),
        product({ id: 'id-b', code: 'PRD-B', name: 'Fanta Orange 500ml Bottle Pack' }),
        DEFAULT_INTELLIGENCE_CONFIG,
      ),
    ).toBeNull();
    expect(
      evaluateDuplicateProducts(product({ name: ' ' }), product({ id: 'id-b', code: 'PRD-B', name: ' ' }), DEFAULT_INTELLIGENCE_CONFIG),
    ).toBeNull();
  });
});
