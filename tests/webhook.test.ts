import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

const secret = 'a'.repeat(32);

function request(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': secret },
    body: { update_id: 123 },
    ...overrides,
  } as VercelRequest;
}

type MockResponse = {
  headersSent: boolean;
  statusCode?: number;
  payload?: unknown;
  status(code: number): MockResponse;
  json(payload: unknown): MockResponse;
};

function response(): VercelResponse & MockResponse {
  const res: MockResponse = {
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      this.headersSent = true;
      return this;
    },
  };
  return res as unknown as VercelResponse & MockResponse;
}

async function loadHandler(processUpdate: (res: VercelResponse) => Promise<void>) {
  vi.resetModules();
  vi.doMock('../src/bot.js', () => ({
    createBot: () => ({ isInited: () => true }),
  }));
  vi.doMock('grammy', () => ({
    webhookCallback: () => async (_req: VercelRequest, res: VercelResponse) => processUpdate(res),
  }));
  return (await import('../api/telegram.js')).default;
}

describe('Telegram webhook', () => {
  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
  });

  it('rejects non-POST requests and bad secrets', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;
    const handler = await loadHandler(async () => {});
    const wrongMethod = response();
    await handler(request({ method: 'GET' }), wrongMethod);
    expect(wrongMethod.statusCode).toBe(405);

    const badSecret = response();
    await handler(request({ headers: { 'x-telegram-bot-api-secret-token': 'wrong' } }), badSecret);
    expect(badSecret.statusCode).toBe(401);
  });

  it('accepts a valid update', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;
    const handler = await loadHandler(async (res) => {
      res.status(200).json({ ok: true });
    });
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(200);
  });

  it('returns a retryable error when processing fails', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = await loadHandler(async () => {
      throw new Error('temporary database failure');
    });
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ ok: false });
  });
});
