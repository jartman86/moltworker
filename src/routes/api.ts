import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createAccessMiddleware } from '../auth';
import { DEFAULT_MODEL, DEFAULT_MAX_TOKENS, R2_KEYS, type BotConfig } from '../config';
import { TelegramClient } from '../telegram';
import {
  loadSoul,
  saveSoul,
  loadAllowlist,
  saveAllowlist,
  listConversations,
  loadConversation,
  deleteConversation,
  listSkills,
  loadSkill,
  saveSkill,
  deleteSkill,
} from '../r2';

/**
 * API routes - all protected by Cloudflare Access
 */
const api = new Hono<AppEnv>();

const adminApi = new Hono<AppEnv>();

// Middleware: Verify Cloudflare Access JWT for all admin routes
adminApi.use('*', createAccessMiddleware({ type: 'json' }));

// GET /api/admin/status - Bot status overview
adminApi.get('/status', async (c) => {
  const env = c.env;
  const bucket = env.MOLTBOT_BUCKET;

  let webhookInfo = null;
  let botInfo = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
    try {
      const wh = await telegram.getWebhookInfo();
      webhookInfo = wh.result;
    } catch { /* ignore */ }
    try {
      const me = await telegram.getMe();
      botInfo = me.result;
    } catch { /* ignore */ }
  }

  const conversations = await listConversations(bucket);
  const allowlist = await loadAllowlist(bucket);

  let botConfig: BotConfig = { model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };
  try {
    const obj = await bucket.get(R2_KEYS.botConfig);
    if (obj) botConfig = await obj.json();
  } catch { /* use defaults */ }

  return c.json({
    ok: true,
    bot: botInfo,
    webhook: webhookInfo,
    conversationCount: conversations.length,
    model: env.ANTHROPIC_MODEL || botConfig.model,
    maxTokens: botConfig.maxTokens,
    allowedUsers: allowlist,
    hasApiKey: !!env.ANTHROPIC_API_KEY,
    hasBotToken: !!env.TELEGRAM_BOT_TOKEN,
  });
});

// GET /api/admin/soul - Get Soul.md content
adminApi.get('/soul', async (c) => {
  const content = await loadSoul(c.env.MOLTBOT_BUCKET);
  return c.json({ content });
});

// PUT /api/admin/soul - Update Soul.md content
adminApi.put('/soul', async (c) => {
  const { content } = await c.req.json<{ content: string }>();
  await saveSoul(c.env.MOLTBOT_BUCKET, content);
  return c.json({ ok: true });
});

// GET /api/admin/allowlist - Get allowed user IDs
adminApi.get('/allowlist', async (c) => {
  const ids = await loadAllowlist(c.env.MOLTBOT_BUCKET);
  return c.json({ userIds: ids });
});

// PUT /api/admin/allowlist - Update allowed user IDs
adminApi.put('/allowlist', async (c) => {
  const { userIds } = await c.req.json<{ userIds: number[] }>();
  await saveAllowlist(c.env.MOLTBOT_BUCKET, userIds);
  return c.json({ ok: true });
});

// GET /api/admin/conversations - List conversation summaries
adminApi.get('/conversations', async (c) => {
  const conversations = await listConversations(c.env.MOLTBOT_BUCKET);
  return c.json({ conversations });
});

// GET /api/admin/conversations/:chatId - Full conversation
adminApi.get('/conversations/:chatId', async (c) => {
  const chatId = parseInt(c.req.param('chatId'), 10);
  if (isNaN(chatId)) return c.json({ error: 'Invalid chatId' }, 400);

  const conversation = await loadConversation(c.env.MOLTBOT_BUCKET, chatId);
  return c.json(conversation);
});

// DELETE /api/admin/conversations/:chatId - Delete conversation
adminApi.delete('/conversations/:chatId', async (c) => {
  const chatId = parseInt(c.req.param('chatId'), 10);
  if (isNaN(chatId)) return c.json({ error: 'Invalid chatId' }, 400);

  await deleteConversation(c.env.MOLTBOT_BUCKET, chatId);
  return c.json({ ok: true });
});

// POST /api/admin/webhook/register - Register Telegram webhook
adminApi.post('/webhook/register', async (c) => {
  const env = c.env;
  if (!env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 400);
  }

  const url = new URL(c.req.url);
  const webhookUrl = `${url.protocol}//${url.host}/webhook/telegram`;
  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

  const result = await telegram.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
  return c.json({ ...result, webhookUrl });
});

// POST /api/admin/webhook/unregister - Unregister Telegram webhook
adminApi.post('/webhook/unregister', async (c) => {
  const env = c.env;
  if (!env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 400);
  }

  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const result = await telegram.deleteWebhook();
  return c.json(result);
});

// GET /api/admin/config - Get bot config
adminApi.get('/config', async (c) => {
  let botConfig: BotConfig = { model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };
  try {
    const obj = await c.env.MOLTBOT_BUCKET.get(R2_KEYS.botConfig);
    if (obj) botConfig = await obj.json();
  } catch { /* use defaults */ }

  return c.json(botConfig);
});

// PUT /api/admin/config - Update bot config
adminApi.put('/config', async (c) => {
  const config = await c.req.json<Partial<BotConfig>>();
  const current: BotConfig = { model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };

  try {
    const obj = await c.env.MOLTBOT_BUCKET.get(R2_KEYS.botConfig);
    if (obj) Object.assign(current, await obj.json());
  } catch { /* use defaults */ }

  if (config.model) current.model = config.model;
  if (config.maxTokens) current.maxTokens = config.maxTokens;

  await c.env.MOLTBOT_BUCKET.put(R2_KEYS.botConfig, JSON.stringify(current));
  return c.json({ ok: true, config: current });
});

// GET /api/admin/skills - List all skills
adminApi.get('/skills', async (c) => {
  const skills = await listSkills(c.env.MOLTBOT_BUCKET);
  return c.json({ skills });
});

// GET /api/admin/skills/:name - Get skill content
adminApi.get('/skills/:name', async (c) => {
  const name = c.req.param('name');
  const content = await loadSkill(c.env.MOLTBOT_BUCKET, name);
  if (content === null) {
    return c.json({ error: 'Skill not found' }, 404);
  }
  return c.json({ name, content });
});

// PUT /api/admin/skills/:name - Create/update a skill
adminApi.put('/skills/:name', async (c) => {
  const name = c.req.param('name');
  const { content } = await c.req.json<{ content: string }>();
  await saveSkill(c.env.MOLTBOT_BUCKET, name, content);
  return c.json({ ok: true });
});

// DELETE /api/admin/skills/:name - Delete a skill
adminApi.delete('/skills/:name', async (c) => {
  const name = c.req.param('name');
  await deleteSkill(c.env.MOLTBOT_BUCKET, name);
  return c.json({ ok: true });
});

// Mount admin API routes under /admin
api.route('/admin', adminApi);

export { api };
