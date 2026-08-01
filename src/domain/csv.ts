import { isValidDate } from './dates';
import { parseAmountToMinor } from './money';

/** Минимальный RFC4180-парсер: кавычки, экранированные кавычки, \r\n. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export type CsvExpense = {
  spentOn: string;
  amountMinor: number;
  categoryName: string;
  payerName: string;
  comment: string | null;
};

export type CsvParseResult = { rows: CsvExpense[]; errors: string[] };

function parseDate(raw: string, currentYear: number): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return isValidDate(Number(y), Number(mo), Number(d)) ? `${y}-${mo}-${d}` : null;
  }
  m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : currentYear;
    if (y < 100) y += 2000;
    if (!isValidDate(y, mo, d)) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

const HEADERS: Record<keyof CsvExpense, RegExp> = {
  spentOn: /дата/i,
  amountMinor: /сумма/i,
  categoryName: /категор/i,
  payerName: /кто платил|плательщик/i,
  comment: /коммент/i,
};

/** Колонки: Дата, Сумма, Категория, Кто платил, Комментарий (последняя опциональна). */
export function parseExpensesCsv(text: string, currentYear: number): CsvParseResult {
  const raw = parseCsv(text);
  if (raw.length < 2) return { rows: [], errors: ['В файле нет строк с данными.'] };

  const header = raw[0]!.map((h) => h.trim());
  const col: Partial<Record<keyof CsvExpense, number>> = {};
  for (const key of Object.keys(HEADERS) as (keyof CsvExpense)[]) {
    const idx = header.findIndex((h) => HEADERS[key].test(h));
    if (idx !== -1) col[key] = idx;
  }
  const missing = (['spentOn', 'amountMinor', 'categoryName', 'payerName'] as const).filter(
    (k) => col[k] === undefined,
  );
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        `Не нашёл колонки: ${missing
          .map((k) => ({ spentOn: 'Дата', amountMinor: 'Сумма', categoryName: 'Категория', payerName: 'Кто платил', comment: '' })[k])
          .join(', ')}. Нужен заголовок: Дата, Сумма, Категория, Кто платил, Комментарий.`,
      ],
    };
  }

  const rows: CsvExpense[] = [];
  const errors: string[] = [];
  for (let i = 1; i < raw.length; i++) {
    const line = raw[i]!;
    const cell = (k: keyof CsvExpense) =>
      col[k] !== undefined ? (line[col[k]!] ?? '').trim() : '';

    const spentOn = parseDate(cell('spentOn'), currentYear);
    const amountMinor = parseAmountToMinor(cell('amountMinor').replace(/\s/g, ''));
    const payerName = cell('payerName');
    if (!spentOn || !amountMinor || amountMinor <= 0 || !payerName) {
      errors.push(`Строка ${i + 1}: не разобрал (${line.join(', ').slice(0, 60)})`);
      continue;
    }
    rows.push({
      spentOn,
      amountMinor,
      categoryName: cell('categoryName') || 'Прочее',
      payerName,
      comment: cell('comment') || null,
    });
  }
  return { rows, errors };
}
