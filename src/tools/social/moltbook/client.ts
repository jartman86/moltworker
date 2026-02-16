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
    const result = await this.request<{
      success: boolean;
      verification_required?: boolean;
      verification?: { code: string; challenge: string };
      post?: { id: string };
    }>('/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (result.verification_required && result.verification) {
      const answer = solveChallenge(result.verification.challenge);
      await this.request('/verify', {
        method: 'POST',
        body: JSON.stringify({
          verification_code: result.verification.code,
          answer,
        }),
      });
    }

    return result;
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<unknown> {
    const body: Record<string, string> = { content };
    if (parentId) body.parent_id = parentId;
    const result = await this.request<{
      success: boolean;
      verification_required?: boolean;
      verification?: { code: string; challenge: string };
    }>(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (result.verification_required && result.verification) {
      const answer = solveChallenge(result.verification.challenge);
      await this.request('/verify', {
        method: 'POST',
        body: JSON.stringify({
          verification_code: result.verification.code,
          answer,
        }),
      });
    }

    return result;
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

/**
 * Solve Moltbook's verification math challenges.
 * Challenges describe a velocity + acceleration problem in obfuscated text.
 * Extract the two numbers and add them.
 */
function solveChallenge(challenge: string): string {
  // Normalize: strip non-alphanumeric except spaces, periods, commas
  const clean = challenge.replace(/[^a-zA-Z0-9\s.,]/g, '').replace(/\s+/g, ' ').toLowerCase();

  // Extract all numbers (written or digit) from the challenge
  const wordToNum: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };

  // Try to find digit-based numbers first
  const digitNumbers = clean.match(/\d+\.?\d*/g)?.map(Number) || [];

  // Try to find word-based compound numbers like "thirty two" → 32
  const words = clean.split(' ');
  const wordNumbers: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (wordToNum[w] !== undefined) {
      const val = wordToNum[w];
      // Check if next word is also a number (compound like "thirty two")
      if (i + 1 < words.length && wordToNum[words[i + 1]] !== undefined) {
        const next = wordToNum[words[i + 1]];
        if (val >= 20 && next < 10) {
          wordNumbers.push(val + next);
          i++; // skip next
          continue;
        }
      }
      wordNumbers.push(val);
    }
  }

  const numbers = digitNumbers.length >= 2 ? digitNumbers : wordNumbers;

  if (numbers.length >= 2) {
    // velocity + acceleration = new velocity
    const result = numbers[0] + numbers[1];
    return result.toFixed(2);
  }

  // Fallback: just return the sum of whatever we found
  const all = [...digitNumbers, ...wordNumbers];
  if (all.length >= 2) {
    return (all[0] + all[1]).toFixed(2);
  }

  return '0.00';
}
