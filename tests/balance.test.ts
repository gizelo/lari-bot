import { describe, expect, it } from 'vitest';
import { computeNets, simplifyDebts, type BalanceEntry } from '../src/domain/balance';
import { splitEqually } from '../src/domain/split';

function expense(payerId: string, amountMinor: number, participants: string[]): BalanceEntry {
  return {
    payerId,
    amountMinor,
    deleted: false,
    shares: splitEqually(amountMinor, participants, payerId),
  };
}

function settlement(payerId: string, toId: string, amountMinor: number): BalanceEntry {
  return { payerId, amountMinor, deleted: false, shares: [{ memberId: toId, shareMinor: amountMinor }] };
}

describe('computeNets + simplifyDebts', () => {
  it('пустая история — все в расчёте', () => {
    expect(simplifyDebts(computeNets([]))).toEqual([]);
  });

  it('один расход 100 от A — B должен A 50', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b'])]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 5000 }]);
  });

  it('симметричные расходы дают ноль', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b']), expense('b', 10000, ['a', 'b'])]);
    expect(simplifyDebts(nets)).toEqual([]);
  });

  it('нечётная сумма: 33 тетри от A — B должен 16, A несёт 17', () => {
    const nets = computeNets([expense('a', 33, ['a', 'b'])]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 16 }]);
  });

  it('settlement ровно на сумму долга обнуляет баланс', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b']), settlement('b', 'a', 5000)]);
    expect(simplifyDebts(nets)).toEqual([]);
  });

  it('частичный settlement уменьшает долг', () => {
    const nets = computeNets([expense('a', 10000, ['a', 'b']), settlement('b', 'a', 2000)]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 3000 }]);
  });

  it('удалённая запись не влияет на баланс', () => {
    const deleted = { ...expense('a', 10000, ['a', 'b']), deleted: true };
    expect(simplifyDebts(computeNets([deleted]))).toEqual([]);
  });

  it('контрольные данные июля: Роберт должен Никите 36.50 ₾', () => {
    const two = ['nikita', 'robert'];
    const nets = computeNets([
      expense('nikita', 47700, two), // продукты
      expense('robert', 22200, two),
      expense('nikita', 2000, two), // кафе
      expense('robert', 20200, two),
    ]);
    expect(simplifyDebts(nets)).toEqual([{ fromId: 'robert', toId: 'nikita', amountMinor: 3650 }]);
  });

  it('вход третьего не меняет старые записи: они делятся по своему снапшоту', () => {
    const nets = computeNets([
      expense('a', 10000, ['a', 'b']), // до прихода c
      expense('c', 9000, ['a', 'b', 'c']),
    ]);
    expect(nets.get('a')).toBe(10000 - 5000 - 3000);
    expect(nets.get('b')).toBe(-5000 - 3000);
    expect(nets.get('c')).toBe(9000 - 3000);
  });

  it('вышедший участник сохраняет долг, пока не рассчитается', () => {
    const nets = computeNets([
      expense('a', 10000, ['a', 'b', 'c']),
      // c вышел, дальше делят на двоих — его долг остаётся
      expense('a', 6000, ['a', 'b']),
    ]);
    expect(nets.get('c')).toBeLessThan(0);
    const transfers = simplifyDebts(nets);
    expect(transfers.some((t) => t.fromId === 'c')).toBe(true);
  });

  it('троим хватает минимального числа переводов', () => {
    // A заплатил всё: B и C должны только A — 2 перевода, не 3
    const nets = computeNets([expense('a', 30000, ['a', 'b', 'c'])]);
    const transfers = simplifyDebts(nets);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.toId === 'a')).toBe(true);
  });

  it('сумма переводов сводит все нетто к нулю', () => {
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
