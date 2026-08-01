import { existsSync } from 'node:fs';

// Только для локальных entrypoint'ов (dev, scripts, seed) — на Vercel env приходит с платформы.
export function loadDotenv(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}
