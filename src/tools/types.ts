/**
 * Tool system interfaces
 */
import type { MoltbotEnv } from '../types';
import type { ToolDefinition } from '../claude/types';

export interface ToolContext {
  env: MoltbotEnv;
  bucket: R2Bucket;
  chatId: number;
}

export interface ToolExecutionResult {
  result: string;
  isError?: boolean;
}

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolExecutionResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutor;
  requiresConfirmation: boolean;
}
