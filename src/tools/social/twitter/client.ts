/**
 * Twitter/X API v2 client
 */
import type { MoltbotEnv } from '../../../types';
import { signRequest } from './oauth';

const TWITTER_API = 'https://api.twitter.com/2';

export class TwitterClient {
  constructor(private env: MoltbotEnv) {}

  private getOAuthParams() {
    return {
      consumerKey: this.env.TWITTER_API_KEY!,
      consumerSecret: this.env.TWITTER_API_SECRET!,
      accessToken: this.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: this.env.TWITTER_ACCESS_SECRET!,
    };
  }

  private async authedRequest(
    method: string,
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    const authHeader = await signRequest(method, url, this.getOAuthParams(), body);

    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    };

    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private bearerRequest(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${this.env.TWITTER_BEARER_TOKEN}`,
      },
    });
  }

  async postTweet(text: string): Promise<{ id: string; text: string }> {
    const resp = await this.authedRequest('POST', `${TWITTER_API}/tweets`, { text });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Twitter postTweet failed (${resp.status}): ${error}`);
    }
    const data: { data: { id: string; text: string } } = await resp.json();
    return data.data;
  }

  async replyToTweet(
    text: string,
    inReplyToId: string,
  ): Promise<{ id: string; text: string }> {
    const resp = await this.authedRequest('POST', `${TWITTER_API}/tweets`, {
      text,
      reply: { in_reply_to_tweet_id: inReplyToId },
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Twitter replyToTweet failed (${resp.status}): ${error}`);
    }
    const data: { data: { id: string; text: string } } = await resp.json();
    return data.data;
  }

  async deleteTweet(tweetId: string): Promise<void> {
    const resp = await this.authedRequest('DELETE', `${TWITTER_API}/tweets/${tweetId}`);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Twitter deleteTweet failed (${resp.status}): ${error}`);
    }
  }

  async getMentions(
    maxResults: number = 10,
  ): Promise<Array<{ id: string; text: string; author_id: string; created_at: string }>> {
    // First get authenticated user ID
    const meResp = await this.bearerRequest(`${TWITTER_API}/users/me`);
    if (!meResp.ok) {
      const error = await meResp.text();
      throw new Error(`Twitter getMe failed (${meResp.status}): ${error}`);
    }
    const meData: { data: { id: string } } = await meResp.json();
    const userId = meData.data.id;

    const url = `${TWITTER_API}/users/${userId}/mentions?max_results=${maxResults}&tweet.fields=created_at,author_id`;
    const resp = await this.bearerRequest(url);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Twitter getMentions failed (${resp.status}): ${error}`);
    }
    const data: { data?: Array<{ id: string; text: string; author_id: string; created_at: string }> } =
      await resp.json();
    return data.data || [];
  }

  async getTweetAnalytics(
    tweetId: string,
  ): Promise<{ retweet_count: number; reply_count: number; like_count: number; impression_count: number }> {
    const url = `${TWITTER_API}/tweets/${tweetId}?tweet.fields=public_metrics`;
    const resp = await this.bearerRequest(url);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Twitter getTweetAnalytics failed (${resp.status}): ${error}`);
    }
    const data: { data: { public_metrics: { retweet_count: number; reply_count: number; like_count: number; impression_count: number } } } =
      await resp.json();
    return data.data.public_metrics;
  }

  isConfigured(): boolean {
    return !!(
      this.env.TWITTER_API_KEY &&
      this.env.TWITTER_API_SECRET &&
      this.env.TWITTER_ACCESS_TOKEN &&
      this.env.TWITTER_ACCESS_SECRET
    );
  }
}
