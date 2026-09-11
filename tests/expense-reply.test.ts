import { describe, expect, it, vi } from 'vitest';
import type { Api } from 'grammy';
import { sendMessageWithReplyFallback } from '../src/handlers/expense.js';

describe('expense reply delivery', () => {
  it('retries without a reply target when the source message no longer exists', async () => {
    const sent = { message_id: 42 };
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce({ description: 'Bad Request: message to be replied not found' })
      .mockResolvedValueOnce(sent);

    const result = await sendMessageWithReplyFallback(
      { sendMessage } as unknown as Api,
      -1001,
      'Saved',
      10,
      { parse_mode: 'HTML' },
    );

    expect(result).toBe(sent);
    expect(sendMessage).toHaveBeenNthCalledWith(1, -1001, 'Saved', {
      parse_mode: 'HTML',
      reply_parameters: { message_id: 10 },
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, -1001, 'Saved', { parse_mode: 'HTML' });
  });

  it('does not hide unrelated Telegram failures', async () => {
    const error = { description: 'Bad Request: chat not found' };
    const sendMessage = vi.fn().mockRejectedValue(error);

    await expect(
      sendMessageWithReplyFallback({ sendMessage } as unknown as Api, -1001, 'Saved', 10),
    ).rejects.toBe(error);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
