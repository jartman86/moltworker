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
