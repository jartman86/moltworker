/**
 * Moltbot Telegram Bot - Cloudflare Worker
 *
 * A lightweight personal AI assistant that runs as a pure Cloudflare Worker.
 * Receives messages via Telegram webhooks, processes them with Claude,
 * and sends responses back.
 *
 * Required secrets (set via `wrangler secret put`):
 * - ANTHROPIC_API_KEY: Your Anthropic API key
 * - TELEGRAM_BOT_TOKEN: Telegram bot token from @BotFather
 *
 * Optional secrets:
 * - TELEGRAM_WEBHOOK_SECRET: Secret for webhook verification
 * - CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD: Cloudflare Access for admin UI
 */

import { Hono } from 'hono';

import type { AppEnv, MoltbotEnv } from './types';
import { createAccessMiddleware } from './auth';
import { publicRoutes, api, adminUi } from './routes';
import { redactSensitiveParams } from './utils/logging';
import configErrorHtml from './assets/config-error.html';

/**
 * Validate required environment variables.
 */
function validateRequiredEnv(env: MoltbotEnv): string[] {
  const missing: string[] = [];
  const isTestMode = env.DEV_MODE === 'true' || env.E2E_TEST_MODE === 'true';

  if (!env.ANTHROPIC_API_KEY) {
    missing.push('ANTHROPIC_API_KEY');
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    missing.push('TELEGRAM_BOT_TOKEN');
  }

  // CF Access vars not required in dev/test mode since auth is skipped
  if (!isTestMode) {
    if (!env.CF_ACCESS_TEAM_DOMAIN) {
      missing.push('CF_ACCESS_TEAM_DOMAIN');
    }
    if (!env.CF_ACCESS_AUD) {
      missing.push('CF_ACCESS_AUD');
    }
  }

  return missing;
}

// Main app
const app = new Hono<AppEnv>();

// =============================================================================
// MIDDLEWARE: Applied to ALL routes
// =============================================================================

// Middleware: Log every request
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const redactedSearch = redactSensitiveParams(url);
  console.log(`[REQ] ${c.req.method} ${url.pathname}${redactedSearch}`);
  await next();
});

// =============================================================================
// PUBLIC ROUTES: No Cloudflare Access authentication required
// =============================================================================

// Mount public routes first (before auth middleware)
// Includes: /webhook/telegram, /api/status, /logo.png, /_admin/assets/*
app.route('/', publicRoutes);

// =============================================================================
// PROTECTED ROUTES: Cloudflare Access authentication required
// =============================================================================

// Middleware: Validate required environment variables
app.use('*', async (c, next) => {
  // Skip validation in dev mode
  if (c.env.DEV_MODE === 'true') {
    return next();
  }

  const missingVars = validateRequiredEnv(c.env);
  if (missingVars.length > 0) {
    console.error('[CONFIG] Missing required environment variables:', missingVars.join(', '));

    const acceptsHtml = c.req.header('Accept')?.includes('text/html');
    if (acceptsHtml) {
      const html = configErrorHtml.replace('{{MISSING_VARS}}', missingVars.join(', '));
      return c.html(html, 503);
    }

    return c.json(
      {
        error: 'Configuration error',
        message: 'Required environment variables are not configured',
        missing: missingVars,
        hint: 'Set these using: wrangler secret put <VARIABLE_NAME>',
      },
      503,
    );
  }

  return next();
});

// Middleware: Cloudflare Access authentication for protected routes
app.use('*', async (c, next) => {
  const acceptsHtml = c.req.header('Accept')?.includes('text/html');
  const middleware = createAccessMiddleware({
    type: acceptsHtml ? 'html' : 'json',
    redirectOnMissing: acceptsHtml,
  });

  return middleware(c, next);
});

// Mount API routes (protected by Cloudflare Access)
app.route('/api', api);

// Mount Admin UI routes (protected by Cloudflare Access)
app.route('/_admin', adminUi);

// =============================================================================
// CATCH-ALL: 404
// =============================================================================

app.all('*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default {
  fetch: app.fetch,
};
