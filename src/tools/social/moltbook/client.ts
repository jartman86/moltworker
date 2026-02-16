/**
 * Moltbook API client — social network for AI agents
 */
import type { MoltbotEnv } from '../../../types';

const BASE_URL = 'https://www.moltbook.com/api/v1';

export class MoltbookClient {
  private apiKey: string | undefined;

  constructor(env: MoltbotEnv) {
    this.apiKey = env.MOLTBOOK_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const resp = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Moltbook API error (${resp.status}): ${text}`);
    }

    return resp.json() as Promise<T>;
  }

  async getProfile(): Promise<{ success: boolean; agent: { name: string; karma: number; follower_count: number; following_count: number } }> {
    return this.request('/agents/me');
  }

  async getStatus(): Promise<{ status: string }> {
    return this.request('/agents/status');
  }

  async getFeed(sort = 'hot', limit = 15): Promise<unknown> {
    return this.request(`/feed?sort=${sort}&limit=${limit}`);
  }

  async getPosts(sort = 'new', limit = 15, submolt?: string): Promise<unknown> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (submolt) params.set('submolt', submolt);
    return this.request(`/posts?${params}`);
  }

  async getPost(postId: string): Promise<unknown> {
    return this.request(`/posts/${postId}`);
  }

  async createPost(submolt: string, title: string, content?: string, url?: string): Promise<unknown> {
    const body: Record<string, string> = { submolt, title };
    if (content) body.content = content;
    if (url) body.url = url;
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<unknown> {
    const body: Record<string, string> = { content };
    if (parentId) body.parent_id = parentId;
    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getComments(postId: string, sort = 'top'): Promise<unknown> {
    return this.request(`/posts/${postId}/comments?sort=${sort}`);
  }

  async upvotePost(postId: string): Promise<unknown> {
    return this.request(`/posts/${postId}/upvote`, { method: 'POST' });
  }

  async downvotePost(postId: string): Promise<unknown> {
    return this.request(`/posts/${postId}/downvote`, { method: 'POST' });
  }

  async upvoteComment(commentId: string): Promise<unknown> {
    return this.request(`/comments/${commentId}/upvote`, { method: 'POST' });
  }

  async search(query: string, type = 'all', limit = 20): Promise<unknown> {
    const params = new URLSearchParams({ q: query, type, limit: String(limit) });
    return this.request(`/search?${params}`);
  }

  async listSubmolts(): Promise<unknown> {
    return this.request('/submolts');
  }

  async subscribe(submoltName: string): Promise<unknown> {
    return this.request(`/submolts/${submoltName}/subscribe`, { method: 'POST' });
  }

  async follow(agentName: string): Promise<unknown> {
    return this.request(`/agents/${agentName}/follow`, { method: 'POST' });
  }

  async checkDMs(): Promise<unknown> {
    return this.request('/agents/dm/check');
  }

  async getDMConversations(): Promise<unknown> {
    return this.request('/agents/dm/conversations');
  }

  async readDMConversation(conversationId: string): Promise<unknown> {
    return this.request(`/agents/dm/conversations/${conversationId}`);
  }

  async sendDM(conversationId: string, message: string): Promise<unknown> {
    return this.request(`/agents/dm/conversations/${conversationId}/send`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async getDMRequests(): Promise<unknown> {
    return this.request('/agents/dm/requests');
  }
}
