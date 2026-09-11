import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required (BotFather -> /newbot)'),
  // Required only by the webhook and validated at the relevant entrypoints.
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (pooled PostgreSQL connection)'),
  // Vercel may inject TZ=':UTC', which Intl does not accept, so normalize and validate it.
  TZ: z
    .string()
    .default('Asia/Tbilisi')
    .transform((tz) => {
      const cleaned = tz.replace(/^:/, '');
      try {
        new Intl.DateTimeFormat('en', { timeZone: cleaned });
        return cleaned === 'UTC' ? 'Asia/Tbilisi' : cleaned;
      } catch {
        return 'Asia/Tbilisi';
      }
    }),
  DEFAULT_CURRENCY: z.string().default('GEL'),
  CURRENCY_SYMBOL: z.string().default('₾'),
});

const secretSchema = z.string().min(32);

export type Config = z.infer<typeof envSchema>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment variables:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function webhookSecret(): string {
  return secretSchema.parse(process.env.TELEGRAM_WEBHOOK_SECRET);
}

export function cronSecret(): string {
  return secretSchema.parse(process.env.CRON_SECRET);
}
