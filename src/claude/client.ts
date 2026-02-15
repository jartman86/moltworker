import type { MoltbotEnv } from '../types';
import { DEFAULT_MODEL, DEFAULT_MAX_TOKENS, R2_KEYS, type BotConfig } from '../config';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

async function loadBotConfig(bucket: R2Bucket): Promise<BotConfig> {
  try {
    const obj = await bucket.get(R2_KEYS.botConfig);
    if (obj) {
      return await obj.json();
    }
  } catch {
    // Fall through to defaults
  }
  return { model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };
}

export async function callClaude(
  env: MoltbotEnv,
  systemPrompt: string,
  messages: ClaudeMessage[],
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  // Resolve model: R2 config > env override > default
  const botConfig = await loadBotConfig(env.MOLTBOT_BUCKET);
  const model = env.ANTHROPIC_MODEL || botConfig.model || DEFAULT_MODEL;
  const maxTokens = env.ANTHROPIC_MAX_TOKENS
    ? parseInt(env.ANTHROPIC_MAX_TOKENS, 10)
    : botConfig.maxTokens || DEFAULT_MAX_TOKENS;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        'Rate limited by Claude API. Please wait a moment and try again.',
      );
    }
    if (response.status === 401) {
      throw new Error(
        'Invalid Anthropic API key. Check your ANTHROPIC_API_KEY configuration.',
      );
    }
    const errorBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorBody}`);
  }

  const data: ClaudeResponse = await response.json();

  if (data.error) {
    throw new Error(`Claude API error: ${data.error.message}`);
  }

  const textBlock = data.content.find((b) => b.type === 'text');
  return textBlock?.text || '(No response)';
}
