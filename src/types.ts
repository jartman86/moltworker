/**
 * Environment bindings for the Moltbot Worker
 */
export interface MoltbotEnv {
  ASSETS: Fetcher;
  MOLTBOT_BUCKET: R2Bucket;
  // Anthropic
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_MAX_TOKENS?: string;
  // Telegram
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_USERS?: string;
  // Cloudflare Access
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  // Twitter/X
  TWITTER_API_KEY?: string;
  TWITTER_API_SECRET?: string;
  TWITTER_ACCESS_TOKEN?: string;
  TWITTER_ACCESS_SECRET?: string;
  TWITTER_BEARER_TOKEN?: string;
  // YouTube
  YOUTUBE_API_KEY?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REFRESH_TOKEN?: string;
  YOUTUBE_CHANNEL_ID?: string;
  // Instagram
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
  // LinkedIn
  LINKEDIN_ACCESS_TOKEN?: string;
  LINKEDIN_PERSON_URN?: string;
  // Google Search
  GOOGLE_SEARCH_API_KEY?: string;
  GOOGLE_SEARCH_CX?: string;
  // Kling AI (video generation)
  KLING_ACCESS_KEY?: string;
  KLING_SECRET_KEY?: string;
  // Flux Pro (image generation)
  FLUX_API_KEY?: string;
  // Ideogram (graphic generation)
  IDEOGRAM_API_KEY?: string;
  // Together.ai (budget image generation)
  TOGETHER_API_KEY?: string;
  // Worker public URL (for media serving)
  WORKER_PUBLIC_URL?: string;
  // Dev/test mode
  DEV_MODE?: string;
  E2E_TEST_MODE?: string;
}

/**
 * Authenticated user from Cloudflare Access
 */
export interface AccessUser {
  email: string;
  name?: string;
}

/**
 * Hono app environment type
 */
export type AppEnv = {
  Bindings: MoltbotEnv;
  Variables: {
    accessUser?: AccessUser;
  };
};

/**
 * JWT payload from Cloudflare Access
 */
export interface JWTPayload {
  aud: string[];
  email: string;
  exp: number;
  iat: number;
  iss: string;
  name?: string;
  sub: string;
  type: string;
}
