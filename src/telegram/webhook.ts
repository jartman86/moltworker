import type { Context } from 'hono';
import type { AppEnv } from '../types';
import type { TelegramUpdate } from './types';
import { TelegramClient } from './api';
import { markdownToTelegramHtml } from './format';
import { isUserAllowed } from '../r2/allowlist';
import {
  loadConversation,
  saveConversation,
  getContextMessages,
  deleteConversation,
} from '../r2/conversations';
import { callClaude } from '../claude/client';
import { buildSystemPrompt } from '../claude/prompt';
import { DEFAULT_MODEL, R2_KEYS } from '../config';

/** Timing-safe string comparison */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function handleTelegramWebhook(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;

  // Verify webhook secret
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const secretHeader = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (!secretHeader || !timingSafeEqual(secretHeader, env.TELEGRAM_WEBHOOK_SECRET)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'Bot token not configured' }, 500);
  }

  // Parse update
  let update: TelegramUpdate;
  try {
    update = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Return 200 immediately, process in waitUntil
  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const bucket = env.MOLTBOT_BUCKET;

  c.executionCtx.waitUntil(processUpdate(update, telegram, bucket, env));

  return c.json({ ok: true });
}

async function processUpdate(
  update: TelegramUpdate,
  telegram: TelegramClient,
  bucket: R2Bucket,
  env: import('../types').MoltbotEnv,
): Promise<void> {
  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text;

  try {
    // Check allowlist
    if (userId) {
      const allowed = await isUserAllowed(bucket, userId, env.TELEGRAM_ALLOWED_USERS);
      if (!allowed) {
        await telegram.sendMessage(chatId, "Sorry, you're not authorized to use this bot.");
        return;
      }
    }

    // Handle non-text messages
    if (!text) {
      await telegram.sendMessage(chatId, "I can only process text messages right now.");
      return;
    }

    // Handle bot commands
    if (text.startsWith('/')) {
      await handleCommand(text, chatId, telegram, bucket, env);
      return;
    }

    // Send typing indicator
    await telegram.sendChatAction(chatId);

    // Load conversation history
    const conversation = await loadConversation(bucket, chatId);

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(bucket);

    // Get trimmed history + new message
    const contextMessages = getContextMessages(conversation.messages);
    contextMessages.push({ role: 'user', content: text });

    // Call Claude
    const response = await callClaude(env, systemPrompt, contextMessages);

    // Save updated conversation
    conversation.messages.push(
      { role: 'user', content: text, timestamp: Date.now() },
      { role: 'assistant', content: response, timestamp: Date.now() },
    );
    await saveConversation(bucket, conversation);

    // Format and send response
    const html = markdownToTelegramHtml(response);
    await telegram.sendMessage(chatId, html, 'HTML');
  } catch (err) {
    console.error('[WEBHOOK] Error processing message:', err);
    const errorMsg =
      err instanceof Error ? err.message : 'An unexpected error occurred';
    await telegram.sendMessage(
      chatId,
      `Sorry, I encountered an error: ${errorMsg}`,
    ).catch((sendErr) => {
      console.error('[WEBHOOK] Failed to send error message:', sendErr);
    });
  }
}

async function handleCommand(
  text: string,
  chatId: number,
  telegram: TelegramClient,
  bucket: R2Bucket,
  env: import('../types').MoltbotEnv,
): Promise<void> {
  const command = text.split(' ')[0].split('@')[0].toLowerCase();

  switch (command) {
    case '/start':
      await telegram.sendMessage(
        chatId,
        "Hi! I'm Moltbot, your personal AI assistant. Send me a message and I'll respond using Claude.\n\nCommands:\n/clear - Reset conversation\n/model - Show current model\n/help - Show this help",
      );
      break;

    case '/clear':
    case '/reset':
      await deleteConversation(bucket, chatId);
      await telegram.sendMessage(chatId, 'Conversation cleared. Starting fresh!');
      break;

    case '/model': {
      let model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
      try {
        const obj = await bucket.get(R2_KEYS.botConfig);
        if (obj) {
          const config = await obj.json<{ model?: string }>();
          if (config.model) model = config.model;
        }
      } catch { /* use default */ }
      // Override with env if set
      if (env.ANTHROPIC_MODEL) model = env.ANTHROPIC_MODEL;
      await telegram.sendMessage(chatId, `Current model: ${model}`);
      break;
    }

    case '/help':
      await telegram.sendMessage(
        chatId,
        "Available commands:\n/start - Welcome message\n/clear - Reset conversation history\n/model - Show current AI model\n/help - Show this help",
      );
      break;

    default:
      await telegram.sendMessage(chatId, `Unknown command: ${command}\nType /help for available commands.`);
      break;
  }
}
