import { describe, expect, it } from 'vitest';
import { isValidDate, isValidIsoDate } from '../src/domain/dates.js';
import { renderExpenseReply } from '../src/domain/formatting.js';
import { isSettlementAmountAllowed, parseMonthArg } from '../src/handlers/commands.js';
import { monthDateRange, validateShares } from '../src/services/expenses.js';

describe('safety boundaries', () => {
  it('rejects invalid full months and accepts real months', () => {
    expect(parseMonthArg('2026-00', 'Asia/Tbilisi')).toBeNull();
    expect(parseMonthArg('2026-13', 'Asia/Tbilisi')).toBeNull();
    expect(parseMonthArg('2026-12', 'Asia/Tbilisi')).toBe('2026-12');
  });

  it('builds half-open month ranges across a year boundary', () => {
    expect(monthDateRange('2026-11')).toEqual({ start: '2026-11-01', end: '2026-12-01' });
    expect(monthDateRange('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });

  it('rejects impossible dates and settlement overpayments', () => {
    expect(isValidDate(2026, 2, 29)).toBe(false);
    expect(isValidDate(2024, 2, 29)).toBe(true);
    expect(isValidDate(0, 1, 1)).toBe(false);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isSettlementAmountAllowed(5_000, 5_000)).toBe(true);
    expect(isSettlementAmountAllowed(5_001, 5_000)).toBe(false);
  });

  it('requires shares to be unique and add up to the expense', () => {
    expect(() => validateShares(100, [{ memberId: 'a', shareMinor: 50 }])).toThrow();
    expect(() =>
      validateShares(100, [
        { memberId: 'a', shareMinor: 50 },
        { memberId: 'a', shareMinor: 50 },
      ]),
    ).toThrow();
    expect(() =>
      validateShares(100, [
        { memberId: 'a', shareMinor: 50 },
        { memberId: 'b', shareMinor: 50 },
      ]),
    ).not.toThrow();
  });

  it('escapes all user-controlled Telegram HTML fields', () => {
    const text = renderExpenseReply(
      {
        amountMinor: 100,
        kind: 'expense',
        comment: '<script>&',
        spentOn: '2026-08-12',
        deleted: false,
        payerId: 'payer',
        categoryName: '<food>',
        categoryEmoji: null,
      },
      new Map([['payer', '<Robert>']]),
      [],
      '₾',
      '2026-08-12',
    );
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;&amp;');
    expect(text).toContain('&lt;food&gt;');
    expect(text).toContain('&lt;Robert&gt;');
  });
});
