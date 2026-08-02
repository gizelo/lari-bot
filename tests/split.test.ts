import { describe, expect, it } from 'vitest';
import { splitEqually } from '../src/domain/split.js';

const shareOf = (shares: ReturnType<typeof splitEqually>, id: string) =>
  shares.find((s) => s.memberId === id)!.shareMinor;

describe('splitEqually', () => {
  it('делит ровно, когда сумма кратна числу участников', () => {
    const shares = splitEqually(10000, ['a', 'b'], 'a');
    expect(shareOf(shares, 'a')).toBe(5000);
    expect(shareOf(shares, 'b')).toBe(5000);
  });

  it('нечётный остаток на двоих достаётся плательщику', () => {
    const shares = splitEqually(33, ['a', 'b'], 'a');
    expect(shareOf(shares, 'a')).toBe(17);
    expect(shareOf(shares, 'b')).toBe(16);
  });

  it('остаток на троих: плательщик первый, потом по порядку', () => {
    const shares = splitEqually(100, ['a', 'b', 'c'], 'b');
    expect(shareOf(shares, 'b')).toBe(34);
    expect(shareOf(shares, 'a')).toBe(33);
    expect(shareOf(shares, 'c')).toBe(33);

    const shares2 = splitEqually(101, ['a', 'b', 'c'], 'b');
    expect(shareOf(shares2, 'b')).toBe(34);
    expect(shareOf(shares2, 'a')).toBe(34);
    expect(shareOf(shares2, 'c')).toBe(33);
  });

  it('сумма долей всегда равна сумме расхода', () => {
    const shares = splitEqually(9999, ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'c');
    expect(shares.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(9999);
  });
});
