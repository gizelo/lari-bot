import { isValidDate, shiftDays } from './dates';
import { parseAmountToMinor } from './money';

export type ParserCategory = {
  id: string;
  name: string;
  aliases: string[];
};

export type ParsedExpense = {
  amountMinor: number;
  spentOn: string;
  categoryId: string | null;
  /** Токен совпал с несколькими категориями — записываем без категории, показываем кнопки. */
  ambiguousCategory: boolean;
  comment: string | null;
  /** Сумма больше 100 000 ₾ — спросить подтверждение вместо молчаливой записи. */
  needsConfirmation: boolean;
};

const CONFIRM_THRESHOLD_MINOR = 100_000 * 100;

const DATE_KEYWORDS: Record<string, number> = {
  сегодня: 0,
  вчера: -1,
  позавчера: -2,
};

const DATE_RE = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/;

function normalize(s: string): string {
  return s.toLowerCase().replaceAll('ё', 'е');
}

function stripPunct(s: string): string {
  return s.replace(/^[.,!?:;()"']+|[,!?:;()"']+$/g, '');
}

/**
 * Дата принимается только первым токеном. `дд.мм` без года считается датой лишь
 * когда дальше есть сумма — иначе `24.07 продукты` это расход на 24.07 ₾.
 */
function parseLeadingDate(
  token: string,
  restHasAmount: boolean,
  today: string,
): string | null {
  const keywordShift = DATE_KEYWORDS[normalize(token)];
  if (keywordShift !== undefined) return shiftDays(today, keywordShift);

  const m = DATE_RE.exec(token);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (!isValidDate(year, month, day)) return null;
  if (!m[3] && !restHasAmount) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

type CategoryMatch = { categoryId: string | null; ambiguous: boolean; tokenIndex: number };

function matchCategory(tokens: string[], categories: ParserCategory[]): CategoryMatch | null {
  const catVariants = categories.map((c) => ({
    id: c.id,
    variants: [normalize(c.name), ...c.aliases.map(normalize)],
  }));

  for (let i = 0; i < tokens.length; i++) {
    const token = normalize(stripPunct(tokens[i]!));
    if (!token) continue;

    const exact = catVariants.filter((c) => c.variants.includes(token));
    if (exact.length === 1) return { categoryId: exact[0]!.id, ambiguous: false, tokenIndex: i };
    if (exact.length > 1) return { categoryId: null, ambiguous: true, tokenIndex: i };

    if (token.length >= 3) {
      const prefix = catVariants.filter((c) =>
        c.variants.some((v) => v.startsWith(token) || (v.length >= 3 && token.startsWith(v))),
      );
      if (prefix.length === 1) {
        return { categoryId: prefix[0]!.id, ambiguous: false, tokenIndex: i };
      }
      if (prefix.length > 1) return { categoryId: null, ambiguous: true, tokenIndex: i };
    }
  }
  return null;
}

/**
 * Чистая функция: текст сообщения -> расход или null.
 * null означает «это не расход» — бот обязан промолчать.
 */
export function parseExpense(
  text: string,
  categories: ParserCategory[],
  today: string,
): ParsedExpense | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const isAmount = (t: string) => parseAmountToMinor(stripPunct(t)) !== null;

  let spentOn = today;
  let rest = tokens;
  const first = tokens[0]!;
  const date = parseLeadingDate(stripPunct(first), tokens.slice(1).some(isAmount), today);
  if (date) {
    spentOn = date;
    rest = tokens.slice(1);
  }

  const amountIndex = rest.findIndex(isAmount);
  if (amountIndex === -1) return null;
  const amountMinor = parseAmountToMinor(stripPunct(rest[amountIndex]!))!;
  if (amountMinor === 0) return null;

  const remaining = rest.filter((_, i) => i !== amountIndex);
  const match = matchCategory(remaining, categories);

  // Неоднозначный токен остаётся в комментарии — это полезный контекст.
  const commentTokens =
    match && !match.ambiguous ? remaining.filter((_, i) => i !== match.tokenIndex) : remaining;
  const comment = commentTokens.join(' ') || null;

  return {
    amountMinor,
    spentOn,
    categoryId: match?.categoryId ?? null,
    ambiguousCategory: match?.ambiguous ?? false,
    comment,
    needsConfirmation: amountMinor > CONFIRM_THRESHOLD_MINOR,
  };
}
