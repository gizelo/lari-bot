import { describe, expect, it } from 'vitest';
import { parseExpensesCsv } from '../src/domain/csv';

describe('parseExpensesCsv', () => {
  it('разбирает выгрузку с датами, запятыми в суммах и кавычками', () => {
    const csv = [
      'Дата,Сумма,Категория,Кто платил,Комментарий',
      '2026-07-01,67,Кафе,Никита,',
      '24.07,113.5,Продукты,Роберт,"карфур, вечером"',
      '25.07.2026,"20,5",Такси,Никита,аэропорт',
    ].join('\n');
    const { rows, errors } = parseExpensesCsv(csv, 2026);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { spentOn: '2026-07-01', amountMinor: 6700, categoryName: 'Кафе', payerName: 'Никита', comment: null },
      { spentOn: '2026-07-24', amountMinor: 11350, categoryName: 'Продукты', payerName: 'Роберт', comment: 'карфур, вечером' },
      { spentOn: '2026-07-25', amountMinor: 2050, categoryName: 'Такси', payerName: 'Никита', comment: 'аэропорт' },
    ]);
  });

  it('битые строки попадают в ошибки, остальные импортируются', () => {
    const csv = ['Дата,Сумма,Категория,Кто платил', '2026-07-01,ерунда,Кафе,Никита', '02.07,10,Кафе,Никита'].join('\n');
    const { rows, errors } = parseExpensesCsv(csv, 2026);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('сообщает об отсутствии обязательных колонок', () => {
    const { rows, errors } = parseExpensesCsv('Дата,Сумма\n01.07,5', 2026);
    expect(rows).toEqual([]);
    expect(errors[0]).toContain('Не нашёл колонки');
  });
});
