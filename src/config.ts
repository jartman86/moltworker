/**
 * Configuration constants for Moltbot Telegram Bot
 */

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_MAX_TOKENS = 4096;
export const TELEGRAM_MAX_LENGTH = 4096;
export const MAX_HISTORY_MESSAGES = 50;
export const MAX_CONTEXT_CHARS = 100_000;

/** R2 key prefixes */
export const R2_KEYS = {
  soul: 'config/soul.md',
  allowlist: 'config/allowlist.json',
  botConfig: 'config/bot.json',
  skillsPrefix: 'skills/',
  conversationsPrefix: 'conversations/',
} as const;

/** Default Soul.md content for new installations */
export const DEFAULT_SOUL = `# Moltbot

You are Moltbot, a helpful personal AI assistant.

## Guidelines
- Be concise and direct
- Use markdown formatting when helpful
- If you don't know something, say so
- Be friendly but professional
`;

/** Bot config stored in R2 */
export interface BotConfig {
  model: string;
  maxTokens: number;
}
