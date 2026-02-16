// API client for admin endpoints
// Authentication is handled by Cloudflare Access (JWT in cookies)

const API_BASE = '/api/admin';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function apiRequest<T>(path: string, options: globalThis.RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  } as globalThis.RequestInit);

  if (response.status === 401) {
    throw new AuthError('Unauthorized - please log in via Cloudflare Access');
  }

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

// Status
export interface BotStatus {
  ok: boolean;
  bot: { id: number; first_name: string; username?: string } | null;
  webhook: {
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  } | null;
  conversationCount: number;
  model: string;
  maxTokens: number;
  allowedUsers: number[];
  hasApiKey: boolean;
  hasBotToken: boolean;
}

export function getStatus(): Promise<BotStatus> {
  return apiRequest<BotStatus>('/status');
}

// Soul
export function getSoul(): Promise<{ content: string }> {
  return apiRequest<{ content: string }>('/soul');
}

export function updateSoul(content: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/soul', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// Allowlist
export function getAllowlist(): Promise<{ userIds: number[] }> {
  return apiRequest<{ userIds: number[] }>('/allowlist');
}

export function updateAllowlist(userIds: number[]): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/allowlist', {
    method: 'PUT',
    body: JSON.stringify({ userIds }),
  });
}

// Conversations
export interface ConversationSummary {
  chatId: number;
  messageCount: number;
  updatedAt: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationDetail {
  chatId: number;
  messages: ConversationMessage[];
  updatedAt: number;
}

export function getConversations(): Promise<{ conversations: ConversationSummary[] }> {
  return apiRequest<{ conversations: ConversationSummary[] }>('/conversations');
}

export function getConversation(chatId: number): Promise<ConversationDetail> {
  return apiRequest<ConversationDetail>(`/conversations/${chatId}`);
}

export function deleteConversation(chatId: number): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/conversations/${chatId}`, { method: 'DELETE' });
}

// Webhook
export function registerWebhook(): Promise<{ ok: boolean; description: string; webhookUrl: string }> {
  return apiRequest<{ ok: boolean; description: string; webhookUrl: string }>('/webhook/register', {
    method: 'POST',
  });
}

export function unregisterWebhook(): Promise<{ ok: boolean; description: string }> {
  return apiRequest<{ ok: boolean; description: string }>('/webhook/unregister', {
    method: 'POST',
  });
}

// Config
export interface BotConfig {
  model: string;
  maxTokens: number;
}

export function getConfig(): Promise<BotConfig> {
  return apiRequest<BotConfig>('/config');
}

export function updateConfig(config: Partial<BotConfig>): Promise<{ ok: boolean; config: BotConfig }> {
  return apiRequest<{ ok: boolean; config: BotConfig }>('/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// Skills
export interface SkillMeta {
  name: string;
  description: string;
}

export function getSkills(): Promise<{ skills: SkillMeta[] }> {
  return apiRequest<{ skills: SkillMeta[] }>('/skills');
}

export function getSkill(name: string): Promise<{ name: string; content: string }> {
  return apiRequest<{ name: string; content: string }>(`/skills/${encodeURIComponent(name)}`);
}

export function updateSkill(name: string, content: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export function deleteSkill(name: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

// Skill Versions
export interface SkillVersionInfo {
  timestamp: number;
}

export function getSkillVersions(name: string): Promise<{ versions: SkillVersionInfo[] }> {
  return apiRequest<{ versions: SkillVersionInfo[] }>(`/skills/${encodeURIComponent(name)}/versions`);
}

export function restoreSkillVersion(name: string, timestamp: number): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}/versions/${timestamp}/restore`, {
    method: 'POST',
  });
}

// Platforms
export interface PlatformStatus {
  configured: boolean;
  oauthConfigured?: boolean;
}

export interface PlatformsResponse {
  platforms: {
    twitter: PlatformStatus;
    youtube: PlatformStatus;
    instagram: PlatformStatus;
    linkedin: PlatformStatus;
    kling: PlatformStatus;
    flux: PlatformStatus;
    ideogram: PlatformStatus;
  };
}

export function getPlatforms(): Promise<PlatformsResponse> {
  return apiRequest<PlatformsResponse>('/platforms');
}

export function testPlatform(name: string): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  return apiRequest<{ ok: boolean; error?: string }>(`/platforms/${name}/test`, {
    method: 'POST',
  });
}

// Feedback
export interface FeedbackEntry {
  chatId: number;
  messageTimestamp: number;
  userMessage: string;
  assistantResponse: string;
  rating: 'positive' | 'negative';
  feedbackText?: string;
  timestamp: number;
}

export interface FeedbackSummary {
  total: number;
  positive: number;
  negative: number;
  recentNegative: FeedbackEntry[];
}

export function getFeedbackSummary(): Promise<FeedbackSummary> {
  return apiRequest<FeedbackSummary>('/feedback');
}

// Learning
export interface LearningAnalysis {
  analysis: string;
  toolCalls: Array<{
    toolName: string;
    input: Record<string, unknown>;
    result: string;
    isError: boolean;
    durationMs: number;
    wasConfirmationGated: boolean;
  }>;
  tokens: { input: number; output: number };
  iterations: number;
}

export function triggerLearningAnalysis(): Promise<LearningAnalysis> {
  return apiRequest<LearningAnalysis>('/learning/analyze', { method: 'POST' });
}

// Tool Logs
export interface ToolLog {
  chatId: number;
  timestamp: number;
  userMessage: string;
  toolCalls: Array<{
    toolName: string;
    input: Record<string, unknown>;
    result: string;
    isError: boolean;
    durationMs: number;
    wasConfirmationGated: boolean;
  }>;
  inputTokens: number;
  outputTokens: number;
  iterations: number;
}

export function getToolLogs(): Promise<{ logs: ToolLog[] }> {
  return apiRequest<{ logs: ToolLog[] }>('/tool-logs');
}
