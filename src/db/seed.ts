import { loadDotenv } from '../env';
loadDotenv();

const DEFAULT_CATEGORIES = [
  { name: 'Продукты', aliases: ['продукты', 'еда', 'магазин', 'супермаркет', 'магаз'], emoji: '🛒' },
  {
    name: 'Кафе/рестораны',
    aliases: ['кафе', 'ресторан', 'рестик', 'кофе', 'бар', 'доставка'],
    emoji: '🍽',
  },
  { name: 'Транспорт', aliases: ['транспорт', 'такси', 'метро', 'бензин', 'автобус'], emoji: '🚕' },
  { name: 'Развлечения', aliases: ['развлечения', 'кино', 'досуг', 'концерт'], emoji: '🎬' },
  { name: 'Дом/быт', aliases: ['дом', 'быт', 'хозтовары', 'химия', 'ремонт'], emoji: '🏠' },
  { name: 'Прочее', aliases: ['прочее', 'другое', 'разное'], emoji: '📦' },
];

async function seed() {
  const { db } = await import('./client');
  const { categories } = await import('./schema');

  for (const [position, cat] of DEFAULT_CATEGORIES.entries()) {
    await db()
      .insert(categories)
      .values({ ...cat, position })
      .onConflictDoNothing();
  }
  console.log(`Сид завершён: ${DEFAULT_CATEGORIES.length} категорий (существующие не тронуты).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
