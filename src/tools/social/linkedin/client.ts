/**
 * LinkedIn API client
 */
import type { MoltbotEnv } from '../../../types';

const LINKEDIN_API = 'https://api.linkedin.com/v2';

export class LinkedInClient {
  constructor(private env: MoltbotEnv) {}

  private get token() {
    return this.env.LINKEDIN_ACCESS_TOKEN!;
  }

  private get personUrn() {
    return this.env.LINKEDIN_PERSON_URN!;
  }

  private authedRequest(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        ...options?.headers,
      },
    });
  }

  async getProfile(): Promise<{
    localizedFirstName: string;
    localizedLastName: string;
    id: string;
  }> {
    const resp = await this.authedRequest(`${LINKEDIN_API}/me`);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`LinkedIn getProfile failed (${resp.status}): ${error}`);
    }
    return resp.json();
  }

  async createPost(text: string): Promise<{ id: string }> {
    const resp = await this.authedRequest(`${LINKEDIN_API}/ugcPosts`, {
      method: 'POST',
      body: JSON.stringify({
        author: this.personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`LinkedIn createPost failed (${resp.status}): ${error}`);
    }
    const data: { id: string } = await resp.json();
    return data;
  }

  async deletePost(postUrn: string): Promise<void> {
    const encodedUrn = encodeURIComponent(postUrn);
    const resp = await this.authedRequest(`${LINKEDIN_API}/ugcPosts/${encodedUrn}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`LinkedIn deletePost failed (${resp.status}): ${error}`);
    }
  }

  async getAnalytics(): Promise<string> {
    // LinkedIn analytics require organization-level access
    // For personal profiles, we return basic profile info
    const profile = await this.getProfile();
    return `LinkedIn Profile: ${profile.localizedFirstName} ${profile.localizedLastName} (ID: ${profile.id})`;
  }

  isConfigured(): boolean {
    return !!(this.env.LINKEDIN_ACCESS_TOKEN && this.env.LINKEDIN_PERSON_URN);
  }
}
