import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { handleTelegramWebhook } from '../telegram';
import { loadMedia } from '../r2/media';

/**
 * Public routes - NO Cloudflare Access authentication required
 *
 * These routes are mounted BEFORE the auth middleware is applied.
 * Includes: webhook, health checks, static assets, and public API endpoints.
 */
const publicRoutes = new Hono<AppEnv>();

// POST /webhook/telegram - Telegram webhook endpoint
publicRoutes.post('/webhook/telegram', handleTelegramWebhook);

// GET /api/status - Public health check
publicRoutes.get('/api/status', (c) => {
  return c.json({ ok: true, service: 'moltbot' });
});

// GET /logo.png - Serve logo from ASSETS binding
publicRoutes.get('/logo.png', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// GET /logo-small.png - Serve small logo from ASSETS binding
publicRoutes.get('/logo-small.png', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// GET /_admin/assets/* - Admin UI static assets (CSS, JS need to load for login redirect)
publicRoutes.get('/_admin/assets/*', async (c) => {
  const url = new URL(c.req.url);
  const assetPath = url.pathname.replace('/_admin/assets/', '/assets/');
  const assetUrl = new URL(assetPath, url.origin);
  return c.env.ASSETS.fetch(new Request(assetUrl.toString(), c.req.raw));
});

// GET /media/* - Serve generated media publicly (needed by Telegram, social APIs)
publicRoutes.get('/media/*', async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname.replace(/^\/media\//, '');
  if (!path) {
    return c.json({ error: 'Not found' }, 404);
  }

  const object = await loadMedia(c.env.MOLTBOT_BUCKET, path);
  if (!object) {
    return c.json({ error: 'Not found' }, 404);
  }

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

export { publicRoutes };
