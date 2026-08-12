import { loadDotenv } from './env.js';
loadDotenv();

const { createBot } = await import('./bot.js');

const bot = createBot();
console.log('Starting Lari with long polling…');
bot.start({
  allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
  onStart: (me) => console.log(`Bot @${me.username} is listening. Press Ctrl+C to stop.`),
});
