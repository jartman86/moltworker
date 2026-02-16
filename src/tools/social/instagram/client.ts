/**
 * Instagram Graph API client (Meta Business API)
 */
import type { MoltbotEnv } from '../../../types';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

export class InstagramClient {
  constructor(private env: MoltbotEnv) {}

  private get accountId() {
    return this.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
  }

  private get token() {
    return this.env.INSTAGRAM_ACCESS_TOKEN!;
  }

  async getProfile(): Promise<{
    name: string;
    username: string;
    followers_count: number;
    media_count: number;
  }> {
    const url = `${GRAPH_API}/${this.accountId}?fields=name,username,followers_count,media_count&access_token=${this.token}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Instagram getProfile failed (${resp.status}): ${error}`);
    }
    return resp.json();
  }

  async getMedia(
    limit: number = 10,
  ): Promise<Array<{
    id: string;
    caption: string;
    media_type: string;
    timestamp: string;
    like_count: number;
    comments_count: number;
  }>> {
    const url = `${GRAPH_API}/${this.accountId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count&limit=${limit}&access_token=${this.token}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Instagram getMedia failed (${resp.status}): ${error}`);
    }
    const data: { data: Array<{ id: string; caption: string; media_type: string; timestamp: string; like_count: number; comments_count: number }> } =
      await resp.json();
    return data.data || [];
  }

  async getInsights(): Promise<Array<{ name: string; values: Array<{ value: number }> }>> {
    const url = `${GRAPH_API}/${this.accountId}/insights?metric=impressions,reach,profile_views&period=day&access_token=${this.token}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Instagram getInsights failed (${resp.status}): ${error}`);
    }
    const data: { data: Array<{ name: string; values: Array<{ value: number }> }> } =
      await resp.json();
    return data.data || [];
  }

  async createPost(
    imageUrl: string,
    caption: string,
  ): Promise<{ id: string }> {
    // Step 1: Create media container
    const containerUrl = `${GRAPH_API}/${this.accountId}/media`;
    const containerResp = await fetch(containerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: this.token,
      }),
    });
    if (!containerResp.ok) {
      const error = await containerResp.text();
      throw new Error(`Instagram createPost container failed (${containerResp.status}): ${error}`);
    }
    const container: { id: string } = await containerResp.json();

    // Step 2: Publish the container
    const publishUrl = `${GRAPH_API}/${this.accountId}/media_publish`;
    const publishResp = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: this.token,
      }),
    });
    if (!publishResp.ok) {
      const error = await publishResp.text();
      throw new Error(`Instagram createPost publish failed (${publishResp.status}): ${error}`);
    }
    return publishResp.json();
  }

  async replyToComment(commentId: string, message: string): Promise<{ id: string }> {
    const url = `${GRAPH_API}/${commentId}/replies`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        access_token: this.token,
      }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Instagram replyToComment failed (${resp.status}): ${error}`);
    }
    return resp.json();
  }

  isConfigured(): boolean {
    return !!(this.env.INSTAGRAM_ACCESS_TOKEN && this.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  }
}
