import { existsSync } from 'node:fs';

// Local entrypoints load .env; Vercel injects environment variables at runtime.
export function loadDotenv(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}
