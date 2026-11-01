/**
 * GL journal builder unit tests (review finding #2):
 * ΣD=ΣC enforcement, one-sided lines, zero-line skipping.
 */
import { describe, expect, it } from 'vitest';
import { JournalBuilder, TENDER_GL_PURPOSE } from './gl.js';
import { ValidationError } from './errors.js';

describe('JournalBuilder', () => {
  it('builds a balanced entry and reports exact totals', () => {
    const j = new JournalBuilder()
      .add({ accountId: 'a-cash', debit: '180.0000', memo: 'cash tender' })
      .add({ accountId: 'a-rev', credit: '170.0000' })
      .add({ accountId: 'a-tax', credit: '10.0000', memo: 'TAX-A 5%' })
      .build();
    expect(j.totalDebit).toBe('180.0000');
    expect(j.totalCredit).toBe('180.0000');
    expect(j.lines).toHaveLength(3);
  });

  it('rejects an unbalanced set (the app-side ΣD=ΣC invariant)', () => {
    const b = new JournalBuilder().add({ accountId: 'a', debit: '10.0000' }).add({ accountId: 'b', credit: '9.9999' });
    expect(() => b.build()).toThrow(ValidationError);
  });

  it('rejects two-sided and zero-sided lines', () => {
    expect(() => new JournalBuilder().add({ accountId: 'a', debit: '1.0000', credit: '1.0000' })).toThrow(ValidationError);
    expect(() => new JournalBuilder().add({ accountId: 'a', debit: '0.0000', credit: '0.0000' })).toThrow(ValidationError);
    expect(() => new JournalBuilder().add({ accountId: 'a' })).toThrow(ValidationError);
  });

  it('rejects negative amounts', () => {
    expect(() => new JournalBuilder().add({ accountId: 'a', debit: '-1.0000' })).toThrow(ValidationError);
  });

  it('rejects an empty entry', () => {
    expect(() => new JournalBuilder().build()).toThrow(ValidationError);
  });

  it('addIfPositive skips zero legs (no-tax / zero-COGS sales carry no dead lines)', () => {
    const b = new JournalBuilder()
      .add({ accountId: 'a-cash', debit: '10.0000' })
      .addIfPositive({ accountId: 'a-tax', credit: '0.0000' })
      .addIfPositive({ accountId: 'a-rev', credit: '10.0000' })
      .addIfPositive({ accountId: 'a-cogs', debit: '0.0000' });
    const j = b.build();
    expect(j.lines).toHaveLength(2);
  });

  it('exact 4dp accumulation: sub-cent legs must not drift', () => {
    const b = new JournalBuilder()
      .add({ accountId: 'a', debit: '0.0001' })
      .add({ accountId: 'a', debit: '0.0002' })
      .add({ accountId: 'b', credit: '0.0003' });
    expect(b.build().totalDebit).toBe('0.0003');
  });
});

describe('TENDER_GL_PURPOSE', () => {
  it('maps every money tender method to a control purpose', () => {
    expect(TENDER_GL_PURPOSE.cash).toBe('cash');
    expect(TENDER_GL_PURPOSE.momo).toBe('momo_clearing');
    expect(TENDER_GL_PURPOSE.cheque).toBe('cheque_clearing');
    expect(TENDER_GL_PURPOSE.bank_transfer).toBe('bank_clearing');
  });
});
