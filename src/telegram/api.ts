import { TELEGRAM_MAX_LENGTH } from '../config';
import type { WebhookInfo } from './types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

export class TelegramClient {
  private baseUrl: string;

  constructor(token: string) {
    this.baseUrl = `${TELEGRAM_API}${token}`;
  }

  async sendMessage(chatId: number, text: string, parseMode?: 'HTML'): Promise<void> {
    const chunks = splitMessage(text);

    for (const chunk of chunks) {
      try {
        await this.send(chatId, chunk, parseMode);
      } catch (err) {
        // If HTML parse fails, retry as plain text
        if (parseMode === 'HTML') {
          console.error('[TG] HTML parse failed, retrying as plain text:', err);
          await this.send(chatId, chunk);
        } else {
          throw err;
        }
      }
    }
  }

  private async send(chatId: number, text: string, parseMode?: string): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (parseMode) body.parse_mode = parseMode;

    const resp = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Telegram sendMessage failed (${resp.status}): ${error}`);
    }
  }

  async sendChatAction(chatId: number, action: string = 'typing'): Promise<void> {
    await fetch(`${this.baseUrl}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  }

  async setWebhook(url: string, secretToken?: string): Promise<{ ok: boolean; description: string }> {
    const body: Record<string, unknown> = { url };
    if (secretToken) body.secret_token = secretToken;

    const resp = await fetch(`${this.baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return resp.json();
  }

  async deleteWebhook(): Promise<{ ok: boolean; description: string }> {
    const resp = await fetch(`${this.baseUrl}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    return resp.json();
  }

  async getWebhookInfo(): Promise<{ ok: boolean; result: WebhookInfo }> {
    const resp = await fetch(`${this.baseUrl}/getWebhookInfo`);
    return resp.json();
  }

  async getMe(): Promise<{ ok: boolean; result: { id: number; first_name: string; username?: string } }> {
    const resp = await fetch(`${this.baseUrl}/getMe`);
    return resp.json();
  }
}

/** Split text at paragraph → sentence → word boundaries to fit Telegram's 4096 char limit */
function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitAt = TELEGRAM_MAX_LENGTH;

    // Try to split at paragraph boundary
    const paragraphIdx = remaining.lastIndexOf('\n\n', TELEGRAM_MAX_LENGTH);
    if (paragraphIdx > TELEGRAM_MAX_LENGTH * 0.3) {
      splitAt = paragraphIdx + 2;
    } else {
      // Try sentence boundary
      const sentenceIdx = remaining.lastIndexOf('. ', TELEGRAM_MAX_LENGTH);
      if (sentenceIdx > TELEGRAM_MAX_LENGTH * 0.3) {
        splitAt = sentenceIdx + 2;
      } else {
        // Try word boundary
        const wordIdx = remaining.lastIndexOf(' ', TELEGRAM_MAX_LENGTH);
        if (wordIdx > TELEGRAM_MAX_LENGTH * 0.3) {
          splitAt = wordIdx + 1;
        }
      }
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}
