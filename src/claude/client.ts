import type { MoltbotEnv } from '../types';
import { DEFAULT_MODEL, DEFAULT_MAX_TOKENS, MAX_TOOL_ITERATIONS, R2_KEYS, type BotConfig } from '../config';
import type {
  ClaudeMessage,
  ClaudeResponse,
  ClaudeResult,
  ContentBlock,
  ToolCallRecord,
  ToolDefinition,
  ToolResultBlock,
  ToolUseBlock,
  PendingActionInfo,
} from './types';
import type { ToolExecutionOutput } from '../tools/registry';

export type ToolExecuteCallback = (
  block: ToolUseBlock,
) => Promise<ToolExecutionOutput>;

export interface CallClaudeOptions {
  tools?: ToolDefinition[];
  executeTools?: ToolExecuteCallback;
  onToolIteration?: () => Promise<void>;
  /** Override the model for this request (e.g. from router) */
  model?: string;
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

const RETRY_DELAYS = [1000, 3000, 8000]; // ms — 3 retries, must fit within CF Workers 30s timeout

async function fetchWithRetry(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  const requestBody = JSON.stringify(body);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: requestBody,
    });

    if (response.status === 429 && attempt < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[attempt];
      console.log(`[CLAUDE API] Rate limited (attempt ${attempt + 1}/${RETRY_DELAYS.length + 1}), retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limited by Claude API after retries. Please wait a moment and try again.');
      }
      if (response.status === 401) {
        throw new Error('Invalid Anthropic API key. Check your ANTHROPIC_API_KEY configuration.');
      }
      const errorBody = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorBody}`);
    }

    return response;
  }

  throw new Error('Unreachable');
}

export async function callClaude(
  env: MoltbotEnv,
  systemPrompt: string,
  messages: ClaudeMessage[],
  options?: CallClaudeOptions,
): Promise<ClaudeResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const botConfig = await loadBotConfig(env.MOLTBOT_BUCKET);
  const model = options?.model || env.ANTHROPIC_MODEL || botConfig.model || DEFAULT_MODEL;
  const maxTokens = env.ANTHROPIC_MAX_TOKENS
    ? parseInt(env.ANTHROPIC_MAX_TOKENS, 10)
    : botConfig.maxTokens || DEFAULT_MAX_TOKENS;

  const toolCalls: ToolCallRecord[] = [];
  const pendingActions: PendingActionInfo[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iterations = 0;

  // Copy messages so we don't mutate the caller's array
  const conversationMessages: ClaudeMessage[] = [...messages];

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: conversationMessages,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetchWithRetry(env.ANTHROPIC_API_KEY, body);

    const data: ClaudeResponse = await response.json();

    if (data.error) {
      throw new Error(`Claude API error: ${data.error.message}`);
    }

    console.log(`[CLAUDE API] iteration=${iterations} model=${model} stop_reason=${data.stop_reason} content_types=${data.content?.map(b => b.type).join(',') || 'none'} hasTools=${!!options?.tools} toolCount=${options?.tools?.length ?? 0}`);

    if (data.usage) {
      totalInputTokens += data.usage.input_tokens;
      totalOutputTokens += data.usage.output_tokens;
    }

    // If no tool use or no executor, extract text and return
    if (data.stop_reason !== 'tool_use' || !options?.executeTools) {
      const text = extractText(data.content);
      return {
        text: text || '(No response)',
        toolCalls,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        iterations,
        pendingActions,
      };
    }

    // Process tool calls
    const toolUseBlocks = data.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );

    // Add assistant message with full content (text + tool_use blocks)
    conversationMessages.push({ role: 'assistant', content: data.content });

    // Execute each tool and collect results
    const toolResults: ToolResultBlock[] = [];

    for (const block of toolUseBlocks) {
      const start = Date.now();
      const output = await options.executeTools(block);
      const durationMs = Date.now() - start;

      toolCalls.push({
        toolName: block.name,
        input: block.input,
        result: output.result.result,
        isError: output.result.isError ?? false,
        durationMs,
        wasConfirmationGated: output.wasConfirmationGated,
      });

      if (output.wasConfirmationGated && output.pendingActionId) {
        pendingActions.push({
          id: output.pendingActionId,
          toolName: block.name,
          description: output.result.result,
        });
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: output.result.result,
        is_error: output.result.isError,
      });
    }

    // Add tool results as user message
    conversationMessages.push({ role: 'user', content: toolResults });

    // Notify caller (e.g., to re-send typing indicator)
    if (options.onToolIteration) {
      await options.onToolIteration();
    }
  }

  // Max iterations reached — extract whatever text we have
  return {
    text: 'I reached the maximum number of tool iterations. Here is what I have so far.',
    toolCalls,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    iterations,
    pendingActions,
  };
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n');
}
