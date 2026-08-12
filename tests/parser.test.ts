import { describe, expect, it } from 'vitest';
import { parseExpense, type ParserCategory } from '../src/domain/parser.js';

const cats: ParserCategory[] = [
  {
    id: 'products',
    name: 'Продукты',
    aliases: ['продукты', 'еда', 'магазин', 'супермаркет', 'магаз'],
  },
  {
    id: 'cafe',
    name: 'Кафе/рестораны',
    aliases: ['кафе', 'ресторан', 'рестик', 'кофе', 'бар', 'доставка'],
  },
  {
    id: 'transport',
    name: 'Транспорт',
    aliases: ['транспорт', 'такси', 'метро', 'бензин', 'автобус'],
  },
  { id: 'fun', name: 'Развлечения', aliases: ['развлечения', 'кино', 'досуг', 'концерт'] },
  { id: 'home', name: 'Дом/быт', aliases: ['дом', 'быт', 'хозтовары', 'химия', 'ремонт'] },
  { id: 'other', name: 'Прочее', aliases: ['прочее', 'другое', 'разное'] },
];

const today = '2026-08-01';
const parse = (text: string) => parseExpense(text, cats, today);

describe('parseExpense', () => {
  it('parses amount followed by category', () => {
    expect(parse('67 кафе')).toEqual({
      amountMinor: 6700,
      spentOn: today,
      categoryId: 'cafe',
      ambiguousCategory: false,
      comment: null,
      needsConfirmation: false,
    });
  });

  it('parses category followed by amount', () => {
    expect(parse('кафе 67')).toMatchObject({ amountMinor: 6700, categoryId: 'cafe' });
  });

  it('accepts dots and commas as decimal separators', () => {
    expect(parse('67.5 продукты')).toMatchObject({ amountMinor: 6750, categoryId: 'products' });
    expect(parse('67,5 продукты')).toMatchObject({ amountMinor: 6750, categoryId: 'products' });
  });

  it('uses the remaining text after a category as a comment', () => {
    expect(parse('113 продукты карфур')).toMatchObject({
      amountMinor: 11300,
      categoryId: 'products',
      comment: 'карфур',
    });
  });

  it('parses a bare amount without a category', () => {
    expect(parse('67')).toMatchObject({
      amountMinor: 6700,
      categoryId: null,
      ambiguousCategory: false,
    });
  });

  it('parses a day and month in the first token', () => {
    expect(parse('24.07 68 продукты')).toMatchObject({ amountMinor: 6800, spentOn: '2026-07-24' });
  });

  it('parses a full date in the first token', () => {
    expect(parse('24.07.2025 68 продукты')).toMatchObject({ spentOn: '2025-07-24' });
  });

  it('parses yesterday and the day before yesterday', () => {
    expect(parse('вчера 20 кафе')).toMatchObject({ spentOn: '2026-07-31' });
    expect(parse('позавчера 33 продукты')).toMatchObject({ spentOn: '2026-07-30' });
  });

  it('treats day.month without a following amount as money', () => {
    expect(parse('24.07 продукты')).toMatchObject({
      amountMinor: 2407,
      spentOn: today,
      categoryId: 'products',
    });
  });

  it('ignores regular conversation and empty strings', () => {
    expect(parse('привет, как дела')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
  });

  it('ignores a zero amount', () => {
    expect(parse('0 кафе')).toBeNull();
  });

  it('requires confirmation above 100,000 ₾', () => {
    expect(parse('150000 ремонт')).toMatchObject({ needsConfirmation: true, categoryId: 'home' });
    expect(parse('99000 ремонт')).toMatchObject({ needsConfirmation: false });
  });

  it('matches category prefixes of at least three characters', () => {
    expect(parse('50 прод')).toMatchObject({ categoryId: 'products' });
    expect(parse('50 пр')).toMatchObject({ categoryId: null });
  });

  it('matches categories case-insensitively', () => {
    expect(parse('50 КАФЕ')).toMatchObject({ categoryId: 'cafe' });
  });

  it('keeps an ambiguous prefix as a comment without selecting a category', () => {
    const ambiguous: ParserCategory[] = [
      { id: 'a', name: 'Спорт', aliases: ['спорт'] },
      { id: 'b', name: 'Спортзал', aliases: ['спортзал'] },
    ];
    expect(parseExpense('100 спо', ambiguous, today)).toMatchObject({
      categoryId: null,
      ambiguousCategory: true,
      comment: 'спо',
    });
  });
});
