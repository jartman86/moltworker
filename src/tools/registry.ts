/**
 * Global tool registry — registration, dispatch, and confirmation gate
 */
import type { ToolUseBlock } from '../claude/types';
import type { RegisteredTool, ToolContext, ToolExecutionResult, ToolExecutor } from './types';
import type { ToolDefinition } from '../claude/types';
import { PENDING_ACTION_TTL_MS } from '../config';
import { savePendingAction } from '../r2/pending-actions';

const registry = new Map<string, RegisteredTool>();

export function registerTool(
  definition: ToolDefinition,
  execute: ToolExecutor,
  options?: { requiresConfirmation?: boolean },
): void {
  registry.set(definition.name, {
    definition,
    execute,
    requiresConfirmation: options?.requiresConfirmation ?? false,
  });
}

export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(registry.values()).map((t) => t.definition);
}

/** Tool categories for dynamic selection */
const TOOL_CATEGORIES: Record<string, string[]> = {
  core: ['web_search', 'fetch_url', 'list_skills', 'read_skill', 'send_media_to_chat'],
  skills: ['update_skill', 'read_soul', 'update_soul'],
  learning: ['get_feedback_summary', 'analyze_and_improve'],
  media: ['generate_image', 'generate_image_fast', 'generate_graphic', 'generate_video'],
  twitter: ['post_tweet', 'reply_to_tweet', 'delete_tweet', 'get_mentions', 'get_tweet_analytics'],
  youtube: ['get_channel_stats', 'list_youtube_videos', 'get_video_stats', 'update_youtube_video', 'reply_to_youtube_comment'],
  instagram: ['get_instagram_profile', 'get_instagram_media', 'get_instagram_insights', 'create_instagram_post', 'reply_to_instagram_comment'],
  linkedin: ['get_linkedin_profile', 'get_linkedin_analytics', 'create_linkedin_post', 'delete_linkedin_post'],
  moltbook: ['moltbook_get_feed', 'moltbook_get_posts', 'moltbook_create_post', 'moltbook_comment', 'moltbook_upvote', 'moltbook_search', 'moltbook_check_dms', 'moltbook_get_post', 'moltbook_list_submolts'],
  polymarket: ['polymarket_scan_markets', 'polymarket_search_markets', 'polymarket_get_market', 'polymarket_get_positions', 'polymarket_get_portfolio', 'polymarket_get_balance', 'polymarket_get_orders'],
};

/** Keyword → categories mapping */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  twitter: ['twitter', 'tweet', 'tweets', 'x.com'],
  youtube: ['youtube', 'yt', 'video', 'channel'],
  instagram: ['instagram', 'ig', 'insta', 'reel', 'reels'],
  linkedin: ['linkedin'],
  moltbook: ['moltbook', 'molt'],
  media: ['image', 'photo', 'picture', 'graphic', 'generate', 'design', 'video', 'thumbnail'],
  skills: ['skill', 'soul', 'personality', 'identity'],
  learning: ['feedback', 'improve', 'learn'],
  polymarket: ['polymarket', 'prediction', 'poly', 'bet', 'wager', 'odds', 'trading', 'market scan'],
};

/**
 * Get tool definitions filtered by message relevance.
 * Always includes core tools; adds platform-specific tools only when keywords match.
 * Also includes any tools that were used in previous iterations (by name).
 */
export function getFilteredToolDefinitions(message: string, usedToolNames?: Set<string>): ToolDefinition[] {
  const lower = message.toLowerCase();

  // Start with core tools
  const selectedNames = new Set<string>(TOOL_CATEGORIES.core);

  // Add categories whose keywords appear in the message
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      for (const name of TOOL_CATEGORIES[category] || []) {
        selectedNames.add(name);
      }
    }
  }

  // Always include tools that were used in previous iterations
  if (usedToolNames) {
    for (const name of usedToolNames) {
      selectedNames.add(name);
      // Also include the whole category if any tool from it was used
      for (const [, toolNames] of Object.entries(TOOL_CATEGORIES)) {
        if (toolNames.includes(name)) {
          for (const n of toolNames) selectedNames.add(n);
        }
      }
    }
  }

  return Array.from(registry.values())
    .filter((t) => selectedNames.has(t.definition.name))
    .map((t) => t.definition);
}

export function getTool(name: string): RegisteredTool | undefined {
  return registry.get(name);
}

export interface ToolExecutionOutput {
  result: ToolExecutionResult;
  wasConfirmationGated: boolean;
  pendingActionId?: string;
}

export async function executeTool(
  block: ToolUseBlock,
  ctx: ToolContext,
): Promise<ToolExecutionOutput> {
  const tool = registry.get(block.name);
  if (!tool) {
    return {
      result: { result: `Unknown tool: ${block.name}`, isError: true },
      wasConfirmationGated: false,
    };
  }

  if (tool.requiresConfirmation) {
    const actionId = crypto.randomUUID();
    const now = Date.now();
    await savePendingAction(ctx.bucket, {
      id: actionId,
      chatId: ctx.chatId,
      toolName: block.name,
      input: block.input,
      createdAt: now,
      expiresAt: now + PENDING_ACTION_TTL_MS,
    });

    const inputSummary = summarizeInput(block.name, block.input);
    return {
      result: {
        result: `This action requires user approval. I've queued it for confirmation. Action: ${block.name} — ${inputSummary}. Tell the user to reply /approve to confirm or /reject to cancel.`,
      },
      wasConfirmationGated: true,
      pendingActionId: actionId,
    };
  }

  try {
    const result = await tool.execute(block.input, ctx);
    return { result, wasConfirmationGated: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { result: `Tool error: ${message}`, isError: true },
      wasConfirmationGated: false,
    };
  }
}

export async function executeToolDirect(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const tool = registry.get(toolName);
  if (!tool) {
    return { result: `Unknown tool: ${toolName}`, isError: true };
  }

  try {
    return await tool.execute(input, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Tool error: ${message}`, isError: true };
  }
}

function summarizeInput(toolName: string, input: Record<string, unknown>): string {
  if (input.text) return `"${String(input.text).slice(0, 100)}"`;
  if (input.content) return `"${String(input.content).slice(0, 100)}"`;
  if (input.title) return `title: "${String(input.title).slice(0, 80)}"`;
  const keys = Object.keys(input).join(', ');
  return keys ? `params: ${keys}` : '(no parameters)';
}
