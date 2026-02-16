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
  getFeedbackSummary,
  loadFeedback,
  listSkillVersions,
  restoreSkillVersion,
} from '../r2';
import { TwitterClient } from '../tools/social/twitter/client';
import { YouTubeClient } from '../tools/social/youtube/client';
import { InstagramClient } from '../tools/social/instagram/client';
import { LinkedInClient } from '../tools/social/linkedin/client';
import { FluxClient } from '../tools/media/flux/client';
import { IdeogramClient } from '../tools/media/ideogram/client';
import { KlingClient } from '../tools/media/kling/client';
import { TogetherClient } from '../tools/media/together/client';
import { initializeTools, getToolDefinitions, executeTool } from '../tools';
import type { ToolContext } from '../tools';
import { callClaude } from '../claude/client';
import { buildSystemPrompt } from '../claude/prompt';
import type { ToolUseBlock } from '../claude/types';
import { saveSkillVersion } from '../r2/skill-versions';

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

// PUT /api/admin/skills/:name - Create/update a skill (saves version history)
adminApi.put('/skills/:name', async (c) => {
  const name = c.req.param('name');
  const { content } = await c.req.json<{ content: string }>();
  const bucket = c.env.MOLTBOT_BUCKET;

  // Save current version before overwriting
  const existing = await loadSkill(bucket, name);
  if (existing) {
    await saveSkillVersion(bucket, name, existing);
  }

  await saveSkill(bucket, name, content);
  return c.json({ ok: true });
});

// DELETE /api/admin/skills/:name - Delete a skill
adminApi.delete('/skills/:name', async (c) => {
  const name = c.req.param('name');
  await deleteSkill(c.env.MOLTBOT_BUCKET, name);
  return c.json({ ok: true });
});

// GET /api/admin/skills/:name/versions - Get skill version history
adminApi.get('/skills/:name/versions', async (c) => {
  const name = c.req.param('name');
  const versions = await listSkillVersions(c.env.MOLTBOT_BUCKET, name);
  return c.json({ versions });
});

// POST /api/admin/skills/:name/versions/:timestamp/restore - Restore a skill version
adminApi.post('/skills/:name/versions/:timestamp/restore', async (c) => {
  const name = c.req.param('name');
  const timestamp = parseInt(c.req.param('timestamp'), 10);
  if (isNaN(timestamp)) return c.json({ error: 'Invalid timestamp' }, 400);

  const success = await restoreSkillVersion(c.env.MOLTBOT_BUCKET, name, timestamp);
  if (!success) {
    return c.json({ error: 'Version not found' }, 404);
  }
  return c.json({ ok: true });
});

// GET /api/admin/platforms - Which platforms are configured
adminApi.get('/platforms', async (c) => {
  const env = c.env;
  return c.json({
    platforms: {
      twitter: {
        configured: !!(env.TWITTER_API_KEY && env.TWITTER_API_SECRET && env.TWITTER_ACCESS_TOKEN && env.TWITTER_ACCESS_SECRET),
      },
      youtube: {
        configured: !!(env.YOUTUBE_API_KEY && env.YOUTUBE_CHANNEL_ID),
        oauthConfigured: !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REFRESH_TOKEN),
      },
      instagram: {
        configured: !!(env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_BUSINESS_ACCOUNT_ID),
      },
      linkedin: {
        configured: !!(env.LINKEDIN_ACCESS_TOKEN && env.LINKEDIN_PERSON_URN),
      },
      kling: {
        configured: !!(env.KLING_ACCESS_KEY && env.KLING_SECRET_KEY),
      },
      flux: {
        configured: !!env.FLUX_API_KEY,
      },
      ideogram: {
        configured: !!env.IDEOGRAM_API_KEY,
      },
      together: {
        configured: !!env.TOGETHER_API_KEY,
      },
    },
  });
});

// POST /api/admin/platforms/:name/test - Test platform connectivity
adminApi.post('/platforms/:name/test', async (c) => {
  const name = c.req.param('name');
  const env = c.env;

  try {
    switch (name) {
      case 'twitter': {
        const client = new TwitterClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        // Use bearer token to test
        const resp = await fetch('https://api.twitter.com/2/users/me', {
          headers: { Authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}` },
        });
        if (!resp.ok) return c.json({ ok: false, error: `API error: ${resp.status}` });
        const data: { data: { username: string } } = await resp.json();
        return c.json({ ok: true, username: data.data.username });
      }
      case 'youtube': {
        const client = new YouTubeClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        const stats = await client.getChannelStats();
        return c.json({ ok: true, channel: stats.title });
      }
      case 'instagram': {
        const client = new InstagramClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        const profile = await client.getProfile();
        return c.json({ ok: true, username: profile.username });
      }
      case 'linkedin': {
        const client = new LinkedInClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        const profile = await client.getProfile();
        return c.json({ ok: true, name: `${profile.localizedFirstName} ${profile.localizedLastName}` });
      }
      case 'kling': {
        const client = new KlingClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        return c.json({ ok: true, message: 'Kling AI credentials present' });
      }
      case 'flux': {
        const client = new FluxClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        return c.json({ ok: true, message: 'Flux Pro API key present' });
      }
      case 'ideogram': {
        const client = new IdeogramClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        return c.json({ ok: true, message: 'Ideogram API key present' });
      }
      case 'together': {
        const client = new TogetherClient(env);
        if (!client.isConfigured()) return c.json({ ok: false, error: 'Not configured' });
        return c.json({ ok: true, message: 'Together.ai API key present' });
      }
      default:
        return c.json({ error: 'Unknown platform' }, 404);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message });
  }
});

// GET /api/admin/feedback - Feedback summary
adminApi.get('/feedback', async (c) => {
  const summary = await getFeedbackSummary(c.env.MOLTBOT_BUCKET);
  return c.json(summary);
});

// GET /api/admin/feedback/:chatId - Per-chat feedback
adminApi.get('/feedback/:chatId', async (c) => {
  const chatId = parseInt(c.req.param('chatId'), 10);
  if (isNaN(chatId)) return c.json({ error: 'Invalid chatId' }, 400);
  const feedback = await loadFeedback(c.env.MOLTBOT_BUCKET, chatId);
  return c.json({ feedback });
});

// POST /api/admin/learning/analyze - Trigger self-improvement analysis
adminApi.post('/learning/analyze', async (c) => {
  const env = c.env;
  const bucket = env.MOLTBOT_BUCKET;

  initializeTools();

  const systemPrompt = await buildSystemPrompt(bucket);
  const learningPrompt = `You are analyzing your own performance. Review the feedback data using your tools and suggest improvements to your skills. Use get_feedback_summary to see how you're doing, then analyze_and_improve to understand patterns. If you identify improvements, use update_skill to propose changes (these will require user approval).`;

  const toolCtx: ToolContext = { env, bucket, chatId: 0 };
  const tools = getToolDefinitions();

  const result = await callClaude(env, systemPrompt + '\n\n' + learningPrompt, [
    { role: 'user', content: 'Analyze recent feedback and suggest improvements to your skills.' },
  ], {
    tools,
    executeTools: (block: ToolUseBlock) => executeTool(block, toolCtx),
  });

  return c.json({
    analysis: result.text,
    toolCalls: result.toolCalls,
    tokens: { input: result.inputTokens, output: result.outputTokens },
    iterations: result.iterations,
  });
});

// GET /api/admin/tool-logs - Recent tool execution logs
adminApi.get('/tool-logs', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const listed = await bucket.list({ prefix: R2_KEYS.toolLogsPrefix });
  const logs: unknown[] = [];

  // Get last 50 logs
  const keys = listed.objects
    .sort((a, b) => (b.uploaded?.getTime() ?? 0) - (a.uploaded?.getTime() ?? 0))
    .slice(0, 50);

  for (const obj of keys) {
    const data = await bucket.get(obj.key);
    if (data) {
      logs.push(await data.json());
    }
  }

  return c.json({ logs });
});

// Mount admin API routes under /admin
api.route('/admin', adminApi);

export { api };
