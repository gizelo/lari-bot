import { describe, expect, it } from 'vitest';
import { computeNets, simplifyDebts, type BalanceEntry } from '../src/domain/balance.js';
import { splitEqually } from '../src/domain/split.js';

function expense(payerId: string, amountMinor: number, participants: string[]): BalanceEntry {
  return {
    payerId,
    amountMinor,
    deleted: false,
    shares: splitEqually(amountMinor, participants, payerId),
  };
}

function settlement(payerId: string, toId: string, amountMinor: number): BalanceEntry {
  return {
    payerId,
    amountMinor,
    deleted: false,
    shares: [{ memberId: toId, shareMinor: amountMinor }],
  };
}

describe('computeNets + simplifyDebts', () => {
  it('returns no transfers for an empty history', () => {
    expect(simplifyDebts(computeNets([]))).toEqual([]);
  });

  it('makes B owe A half of an expense paid by A', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b'])]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 5000 }]);
  });

  it('cancels out symmetric expenses', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b']), expense('b', 10000, ['a', 'b'])]);
    expect(simplifyDebts(nets)).toEqual([]);
  });

  it('assigns the odd minor unit to the payer', () => {
    const nets = computeNets([expense('a', 33, ['a', 'b'])]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 16 }]);
  });

  it('clears the balance with an exact settlement', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b']), settlement('b', 'a', 5000)]);
    expect(simplifyDebts(nets)).toEqual([]);
  });

  it('reduces debt with a partial settlement', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b']), settlement('b', 'a', 2000)]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 3000 }]);
  });

  it('ignores deleted records', () => {
    const deleted = { ...expense('a', 10000, ['a', 'b']), deleted: true };
    expect(simplifyDebts(computeNets([deleted]))).toEqual([]);
  });

  it('matches the July reference balance', () => {
    const two = ['nikita', 'robert'];
    const nets = computeNets([
      expense('nikita', 47700, two), // groceries
      expense('robert', 22200, two),
      expense('nikita', 2000, two), // cafe
      expense('robert', 20200, two),
    ]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'robert', toId: 'nikita', amountMinor: 3650 }]);
  });

  it('does not change historical shares when a third member joins', () => {
    const nets = computeNets([
      expense('a', 10000, ['a', 'b']), // before c joins
      expense('c', 9000, ['a', 'b', 'c']),
    ]);
    expect(nets.get('a')).toBe(10000 - 5000 - 3000);
    expect(nets.get('b')).toBe(-5000 - 3000);
    expect(nets.get('c')).toBe(9000 - 3000);
  });

  it('preserves debt after a member leaves', () => {
    const nets = computeNets([
      expense('a', 10000, ['a', 'b', 'c']),
      // c has left, so new expenses are split between two members while the old debt remains.
      expense('a', 6000, ['a', 'b']),
    ]);
    expect(nets.get('c')).toBeLessThan(0);
    const transfers = simplifyDebts(nets);
    expect(transfers.some((t) => t.fromId === 'c')).toBe(true);
  });

  it('uses the minimum number of transfers for three members', () => {
    // A paid everything, so B and C each need one transfer to A.
    const nets = computeNets([expense('a', 30000, ['a', 'b', 'c'])]);
    const transfers = simplifyDebts(nets);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.toId === 'a')).toBe(true);
  });

  it('keeps the total net balance at zero', () => {
    const entries = [
      expense('a', 12345, ['a', 'b', 'c']),
      expense('b', 6789, ['a', 'b', 'c']),
      expense('c', 101, ['b', 'c']),
      settlement('c', 'a', 1500),
    ];
    const nets = computeNets(entries);
    const total = [...nets.values()].reduce((acc, n) => acc + n, 0);
    expect(total).toBe(0);
  });
});
