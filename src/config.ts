import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN обязателен (BotFather -> /newbot)'),
  // Обязателен только для вебхука — проверяется в api/telegram.ts и scripts/set-webhook.ts.
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL обязателен (Supabase transaction pooler, порт 6543)'),
  ADMIN_TG_ID: z.coerce.number().int().positive({
    message: 'ADMIN_TG_ID обязателен: tg user id админа (бот покажет его на /start в личке)',
  }),
  TZ: z.string().default('Asia/Tbilisi'),
  DEFAULT_CURRENCY: z.string().default('GEL'),
  CURRENCY_SYMBOL: z.string().default('₾'),
});

export type Config = z.infer<typeof envSchema>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Некорректные переменные окружения:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
