import { loadDotenv } from './env.js';
loadDotenv();

const { createBot } = await import('./bot.js');

const bot = createBot();
console.log('Lari запускается на long polling…');
bot.start({
  allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
  onStart: (me) => console.log(`Бот @${me.username} слушает. Ctrl+C для остановки.`),
});
