import { loadDotenv } from './env';
loadDotenv();

const { createBot } = await import('./bot');

const bot = createBot();
console.log('Lari запускается на long polling…');
bot.start({
  onStart: (me) => console.log(`Бот @${me.username} слушает. Ctrl+C для остановки.`),
});
