/**
 * Claude API types for tool_use support
 */

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock;

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[] | ToolResultBlock[];
}

export interface ClaudeResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  result: string;
  isError: boolean;
  durationMs: number;
  wasConfirmationGated: boolean;
}

export interface PendingActionInfo {
  id: string;
  toolName: string;
  description: string;
}

export interface ClaudeResult {
  text: string;
  toolCalls: ToolCallRecord[];
  inputTokens: number;
  outputTokens: number;
  iterations: number;
  pendingActions: PendingActionInfo[];
}
