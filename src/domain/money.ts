// Store money as integer minor units only (1 ₾ = 100 tetri).
// Parse from strings because intermediate floating-point multiplication can lose precision.

const AMOUNT_RE = /^(\d+)(?:[.,](\d{1,2}))?$/;

export function parseAmountToMinor(token: string): number | null {
  const m = AMOUNT_RE.exec(token);
  if (!m) return null;
  const whole = m[1]!;
  const frac = (m[2] ?? '').padEnd(2, '0');
  const minor = Number(whole) * 100 + Number(frac);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMinor(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

export function formatMoney(minor: number, symbol = '₾'): string {
  return `${formatMinor(minor)} ${symbol}`;
}
