import { describe, expect, it } from 'vitest';
import { parseExpense, type ParserCategory } from '../src/domain/parser';

const cats: ParserCategory[] = [
  { id: 'products', name: 'Продукты', aliases: ['продукты', 'еда', 'магазин', 'супермаркет', 'магаз'] },
  { id: 'cafe', name: 'Кафе/рестораны', aliases: ['кафе', 'ресторан', 'рестик', 'кофе', 'бар', 'доставка'] },
  { id: 'transport', name: 'Транспорт', aliases: ['транспорт', 'такси', 'метро', 'бензин', 'автобус'] },
  { id: 'fun', name: 'Развлечения', aliases: ['развлечения', 'кино', 'досуг', 'концерт'] },
  { id: 'home', name: 'Дом/быт', aliases: ['дом', 'быт', 'хозтовары', 'химия', 'ремонт'] },
  { id: 'other', name: 'Прочее', aliases: ['прочее', 'другое', 'разное'] },
];

const today = '2026-08-01';
const parse = (text: string) => parseExpense(text, cats, today);

describe('parseExpense', () => {
  it('распознаёт «сумма категория»', () => {
    expect(parse('56 кафе')).toEqual({
      amountMinor: 5600,
      spentOn: today,
      categoryId: 'cafe',
      ambiguousCategory: false,
      comment: null,
      needsConfirmation: false,
    });
  });

  it('распознаёт обратный порядок «категория сумма»', () => {
    expect(parse('кафе 56')).toMatchObject({ amountMinor: 5600, categoryId: 'cafe' });
  });

  it('принимает точку и запятую как разделитель копеек', () => {
    expect(parse('56.5 продукты')).toMatchObject({ amountMinor: 5650, categoryId: 'products' });
    expect(parse('56,5 продукты')).toMatchObject({ amountMinor: 5650, categoryId: 'products' });
  });

  it('остаток строки после категории становится комментарием', () => {
    expect(parse('113 продукты карфур')).toMatchObject({
      amountMinor: 11300,
      categoryId: 'products',
      comment: 'карфур',
    });
  });

  it('голая сумма — расход без категории', () => {
    expect(parse('56')).toMatchObject({ amountMinor: 5600, categoryId: null, ambiguousCategory: false });
  });

  it('дата дд.мм первым токеном', () => {
    expect(parse('24.07 68 продукты')).toMatchObject({ amountMinor: 6800, spentOn: '2026-07-24' });
  });

  it('дата дд.мм.гггг первым токеном', () => {
    expect(parse('24.07.2025 68 продукты')).toMatchObject({ spentOn: '2025-07-24' });
  });

  it('вчера и позавчера', () => {
    expect(parse('вчера 20 кафе')).toMatchObject({ spentOn: '2026-07-31' });
    expect(parse('позавчера 33 продукты')).toMatchObject({ spentOn: '2026-07-30' });
  });

  it('дд.мм без суммы после — это сумма, не дата', () => {
    expect(parse('24.07 продукты')).toMatchObject({
      amountMinor: 2407,
      spentOn: today,
      categoryId: 'products',
    });
  });

  it('молчит на обычной переписке и пустых строках', () => {
    expect(parse('привет, как дела')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
  });

  it('молчит на нулевой сумме', () => {
    expect(parse('0 кафе')).toBeNull();
  });

  it('сумма больше 100 000 ₾ требует подтверждения', () => {
    expect(parse('150000 ремонт')).toMatchObject({ needsConfirmation: true, categoryId: 'home' });
    expect(parse('99000 ремонт')).toMatchObject({ needsConfirmation: false });
  });

  it('матчит категорию по префиксу от 3 символов', () => {
    expect(parse('50 прод')).toMatchObject({ categoryId: 'products' });
    expect(parse('50 пр')).toMatchObject({ categoryId: null });
  });

  it('нечувствителен к регистру и ё', () => {
    expect(parse('50 КАФЕ')).toMatchObject({ categoryId: 'cafe' });
  });

  it('неоднозначный префикс — без категории, токен уходит в комментарий', () => {
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
