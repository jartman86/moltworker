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
import { selectModel } from '../claude/router';
import { DEFAULT_MODEL, R2_KEYS } from '../config';
import { initializeTools, getFilteredToolDefinitions, executeTool } from '../tools';
import type { ToolContext } from '../tools';
import type { ToolUseBlock } from '../claude/types';
import {
  loadPendingActions,
  deletePendingAction,
} from '../r2/pending-actions';
import { executeToolDirect } from '../tools/registry';
import { saveFeedback } from '../r2/feedback';

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

  // Process in the main handler — Standard plan gives 30s CPU with unlimited I/O wall clock.
  // This avoids the waitUntil timeout that was killing multi-step agent loops.
  // Telegram may retry if we take too long, but our update_id dedup handles that.
  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const bucket = env.MOLTBOT_BUCKET;

  await processUpdate(update, telegram, bucket, env);

  return c.json({ ok: true });
}

async function processUpdate(
  update: TelegramUpdate,
  telegram: TelegramClient,
  bucket: R2Bucket,
  env: import('../types').MoltbotEnv,
): Promise<void> {
  // Deduplicate by update_id — Telegram may deliver the same update multiple times
  const updateId = update.update_id;
  const dedupeKey = `locks/update_${updateId}`;
  const alreadyProcessed = await bucket.head(dedupeKey);
  if (alreadyProcessed) {
    console.log(`[WEBHOOK] Skipping duplicate update_id=${updateId}`);
    return;
  }
  // Mark as seen immediately (tiny empty object — race window is ~ms)
  await bucket.put(dedupeKey, '1');

  // Handle callback queries (inline button presses)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat.id;
    const userId = cb.from.id;
    const data = cb.data;

    if (!chatId || !data) {
      await telegram.answerCallbackQuery(cb.id);
      return;
    }

    // Check allowlist
    const allowed = await isUserAllowed(bucket, userId, env.TELEGRAM_ALLOWED_USERS);
    if (!allowed) {
      await telegram.answerCallbackQuery(cb.id, 'Not authorized');
      return;
    }

    if (data === 'feedback_positive' || data === 'feedback_negative') {
      await handleFeedbackCallback(cb.id, chatId, data, telegram, bucket);
      return;
    }

    await telegram.answerCallbackQuery(cb.id);
    return;
  }

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

    // Per-chat concurrency lock — only one Claude call per chat at a time
    // TTL is short (30s) because if waitUntil kills the process, the finally block
    // never runs and the lock would otherwise block all subsequent messages.
    const chatLockKey = `locks/chat_${chatId}`;
    const existingLock = await bucket.get(chatLockKey);
    if (existingLock) {
      const lockData = await existingLock.json<{ timestamp: number }>();
      if (Date.now() - lockData.timestamp < 30_000) {
        console.log(`[WEBHOOK] Chat ${chatId} already processing (locked ${Date.now() - lockData.timestamp}ms ago), skipping`);
        return;
      }
    }
    await bucket.put(chatLockKey, JSON.stringify({ timestamp: Date.now() }));

    // Initialize tools
    initializeTools();

    // Send typing indicator
    await telegram.sendChatAction(chatId);

    // Load conversation history
    const conversation = await loadConversation(bucket, chatId);

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(bucket);

    // Get trimmed history + new message
    const contextMessages = getContextMessages(conversation.messages);
    contextMessages.push({ role: 'user', content: text });

    // Select model based on message complexity
    const selectedModel = selectModel(text);

    // Set up tool context — send tools relevant to recent conversation, not just current message
    const toolCtx: ToolContext = { env, bucket, chatId };
    // Build keyword context from the last few messages so follow-ups like "do it" still get the right tools
    const recentTexts = contextMessages
      .slice(-6)
      .filter((m) => typeof m.content === 'string')
      .map((m) => m.content as string)
      .join(' ');
    const tools = getFilteredToolDefinitions(recentTexts);

    console.log(`[CLAUDE] model=${selectedModel} tools=${tools.length} systemPromptLen=${systemPrompt.length} historyMsgs=${contextMessages.length}`);

    // Call Claude with tool support
    const result = await callClaude(env, systemPrompt, contextMessages, {
      tools: tools.length > 0 ? tools : undefined,
      executeTools: tools.length > 0
        ? (block: ToolUseBlock) => executeTool(block, toolCtx)
        : undefined,
      onToolIteration: () => telegram.sendChatAction(chatId),
      model: selectedModel,
    });

    console.log(`[CLAUDE] result: toolCalls=${result.toolCalls.length} iterations=${result.iterations} inputTokens=${result.inputTokens} outputTokens=${result.outputTokens}`);

    // Log every request (not just tool calls) for debugging
    const logKey = `${R2_KEYS.toolLogsPrefix}${chatId}/${Date.now()}.json`;
    await bucket.put(logKey, JSON.stringify({
      chatId,
      timestamp: Date.now(),
      userMessage: text,
      model: selectedModel,
      toolCount: tools.length,
      systemPromptLength: systemPrompt.length,
      toolCalls: result.toolCalls,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      iterations: result.iterations,
    }));

    // Save updated conversation
    conversation.messages.push(
      { role: 'user', content: text, timestamp: Date.now() },
      { role: 'assistant', content: result.text, timestamp: Date.now() },
    );
    await saveConversation(bucket, conversation);

    // Format and send response with feedback buttons
    const html = markdownToTelegramHtml(result.text);
    const feedbackKeyboard = {
      inline_keyboard: [
        [
          { text: '\u{1F44D}', callback_data: 'feedback_positive' },
          { text: '\u{1F44E}', callback_data: 'feedback_negative' },
        ],
      ],
    };
    await telegram.sendMessage(chatId, html, 'HTML', feedbackKeyboard);
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
  } finally {
    // Release per-chat lock
    const chatLockKey = `locks/chat_${chatId}`;
    await bucket.delete(chatLockKey).catch(() => {});
  }
}

async function handleFeedbackCallback(
  callbackQueryId: string,
  chatId: number,
  data: string,
  telegram: TelegramClient,
  bucket: R2Bucket,
): Promise<void> {
  const rating = data === 'feedback_positive' ? 'positive' : 'negative';

  // Load conversation to get the last exchange
  const conversation = await loadConversation(bucket, chatId);
  const msgs = conversation.messages;

  let userMessage = '';
  let assistantResponse = '';

  // Find the last user-assistant pair
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && !assistantResponse) {
      assistantResponse = msgs[i].content;
    }
    if (msgs[i].role === 'user' && assistantResponse && !userMessage) {
      userMessage = msgs[i].content;
      break;
    }
  }

  await saveFeedback(bucket, {
    chatId,
    messageTimestamp: Date.now(),
    userMessage,
    assistantResponse,
    rating,
    timestamp: Date.now(),
  });

  const emoji = rating === 'positive' ? '\u{1F44D}' : '\u{1F44E}';
  await telegram.answerCallbackQuery(callbackQueryId, `${emoji} Feedback recorded!`);
}

async function handleCommand(
  text: string,
  chatId: number,
  telegram: TelegramClient,
  bucket: R2Bucket,
  env: import('../types').MoltbotEnv,
): Promise<void> {
  const parts = text.split(' ');
  const command = parts[0].split('@')[0].toLowerCase();

  switch (command) {
    case '/start':
      await telegram.sendMessage(
        chatId,
        "Hi! I'm Big Earn, your personal AI assistant. Send me a message and I'll respond using Claude.\n\nCommands:\n/clear - Reset conversation\n/model - Show current model\n/approve - Approve a pending action\n/reject - Reject a pending action\n/feedback - Give text feedback on my last response\n/help - Show this help",
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
      if (env.ANTHROPIC_MODEL) model = env.ANTHROPIC_MODEL;
      await telegram.sendMessage(chatId, `Current model: ${model}`);
      break;
    }

    case '/approve': {
      initializeTools();
      const actions = await loadPendingActions(bucket, chatId);
      if (actions.length === 0) {
        await telegram.sendMessage(chatId, 'No pending actions to approve.');
        break;
      }
      const action = actions[0]; // Most recent
      const toolCtx: ToolContext = { env, bucket, chatId };
      await telegram.sendChatAction(chatId);
      const result = await executeToolDirect(action.toolName, action.input, toolCtx);
      await deletePendingAction(bucket, chatId, action.id);

      if (result.isError) {
        await telegram.sendMessage(chatId, `Action failed: ${result.result}`);
      } else {
        const html = markdownToTelegramHtml(`Action approved and executed!\n\n${result.result}`);
        await telegram.sendMessage(chatId, html, 'HTML');
      }
      break;
    }

    case '/reject': {
      const actions = await loadPendingActions(bucket, chatId);
      if (actions.length === 0) {
        await telegram.sendMessage(chatId, 'No pending actions to reject.');
        break;
      }
      const action = actions[0];
      await deletePendingAction(bucket, chatId, action.id);
      await telegram.sendMessage(chatId, `Action cancelled: ${action.toolName}`);
      break;
    }

    case '/feedback': {
      const feedbackText = parts.slice(1).join(' ').trim();
      if (!feedbackText) {
        await telegram.sendMessage(chatId, 'Usage: /feedback <your feedback text>');
        break;
      }

      const conversation = await loadConversation(bucket, chatId);
      const msgs = conversation.messages;
      let userMessage = '';
      let assistantResponse = '';

      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && !assistantResponse) {
          assistantResponse = msgs[i].content;
        }
        if (msgs[i].role === 'user' && assistantResponse && !userMessage) {
          userMessage = msgs[i].content;
          break;
        }
      }

      await saveFeedback(bucket, {
        chatId,
        messageTimestamp: Date.now(),
        userMessage,
        assistantResponse,
        rating: 'negative',
        feedbackText,
        timestamp: Date.now(),
      });

      await telegram.sendMessage(chatId, 'Thanks for the feedback! I\'ll use it to improve.');
      break;
    }

    case '/help':
      await telegram.sendMessage(
        chatId,
        "Available commands:\n/start - Welcome message\n/clear - Reset conversation history\n/model - Show current AI model\n/approve - Approve a pending action\n/reject - Reject a pending action\n/feedback <text> - Give feedback on my last response\n/help - Show this help",
      );
      break;

    default:
      await telegram.sendMessage(chatId, `Unknown command: ${command}\nType /help for available commands.`);
      break;
  }
}
