/**
 * YouTube Data API v3 client with OAuth2 refresh token flow
 */
import type { MoltbotEnv } from '../../../types';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class YouTubeClient {
  private accessToken: string | null = null;

  constructor(private env: MoltbotEnv) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.env.YOUTUBE_CLIENT_ID!,
        client_secret: this.env.YOUTUBE_CLIENT_SECRET!,
        refresh_token: this.env.YOUTUBE_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`YouTube token refresh failed (${resp.status}): ${error}`);
    }

    const data: { access_token: string } = await resp.json();
    this.accessToken = data.access_token;
    return data.access_token;
  }

  private async authedRequest(url: string, options?: RequestInit): Promise<Response> {
    const token = await this.getAccessToken();
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  private apiKeyRequest(url: string): Promise<Response> {
    const separator = url.includes('?') ? '&' : '?';
    return fetch(`${url}${separator}key=${this.env.YOUTUBE_API_KEY}`);
  }

  async getChannelStats(): Promise<{
    title: string;
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  }> {
    const channelId = this.env.YOUTUBE_CHANNEL_ID;
    const url = `${YOUTUBE_API}/channels?part=snippet,statistics&id=${channelId}`;
    const resp = await this.apiKeyRequest(url);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`YouTube getChannelStats failed (${resp.status}): ${error}`);
    }
    const data: { items: Array<{ snippet: { title: string }; statistics: { subscriberCount: string; videoCount: string; viewCount: string } }> } =
      await resp.json();
    if (!data.items?.length) throw new Error('Channel not found');
    const ch = data.items[0];
    return {
      title: ch.snippet.title,
      subscriberCount: ch.statistics.subscriberCount,
      videoCount: ch.statistics.videoCount,
      viewCount: ch.statistics.viewCount,
    };
  }

  async listVideos(
    maxResults: number = 10,
  ): Promise<Array<{ id: string; title: string; publishedAt: string; viewCount: string }>> {
    const channelId = this.env.YOUTUBE_CHANNEL_ID;
    const searchUrl = `${YOUTUBE_API}/search?part=id&channelId=${channelId}&type=video&order=date&maxResults=${maxResults}`;
    const searchResp = await this.apiKeyRequest(searchUrl);
    if (!searchResp.ok) {
      const error = await searchResp.text();
      throw new Error(`YouTube listVideos search failed (${searchResp.status}): ${error}`);
    }
    const searchData: { items: Array<{ id: { videoId: string } }> } = await searchResp.json();
    if (!searchData.items?.length) return [];

    const videoIds = searchData.items.map((i) => i.id.videoId).join(',');
    const videosUrl = `${YOUTUBE_API}/videos?part=snippet,statistics&id=${videoIds}`;
    const videosResp = await this.apiKeyRequest(videosUrl);
    if (!videosResp.ok) {
      const error = await videosResp.text();
      throw new Error(`YouTube listVideos detail failed (${videosResp.status}): ${error}`);
    }
    const videosData: { items: Array<{ id: string; snippet: { title: string; publishedAt: string }; statistics: { viewCount: string } }> } =
      await videosResp.json();

    return videosData.items.map((v) => ({
      id: v.id,
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt,
      viewCount: v.statistics.viewCount,
    }));
  }

  async getVideoStats(
    videoId: string,
  ): Promise<{
    title: string;
    viewCount: string;
    likeCount: string;
    commentCount: string;
  }> {
    const url = `${YOUTUBE_API}/videos?part=snippet,statistics&id=${videoId}`;
    const resp = await this.apiKeyRequest(url);
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`YouTube getVideoStats failed (${resp.status}): ${error}`);
    }
    const data: { items: Array<{ snippet: { title: string }; statistics: { viewCount: string; likeCount: string; commentCount: string } }> } =
      await resp.json();
    if (!data.items?.length) throw new Error('Video not found');
    const v = data.items[0];
    return {
      title: v.snippet.title,
      viewCount: v.statistics.viewCount,
      likeCount: v.statistics.likeCount,
      commentCount: v.statistics.commentCount,
    };
  }

  async updateVideo(
    videoId: string,
    title?: string,
    description?: string,
  ): Promise<void> {
    // First get current snippet for the category
    const getUrl = `${YOUTUBE_API}/videos?part=snippet&id=${videoId}`;
    const getResp = await this.authedRequest(getUrl);
    if (!getResp.ok) {
      const error = await getResp.text();
      throw new Error(`YouTube getVideo failed (${getResp.status}): ${error}`);
    }
    const getData: { items: Array<{ snippet: { title: string; description: string; categoryId: string; tags?: string[] } }> } =
      await getResp.json();
    if (!getData.items?.length) throw new Error('Video not found');

    const snippet = getData.items[0].snippet;
    if (title) snippet.title = title;
    if (description) snippet.description = description;

    const resp = await this.authedRequest(`${YOUTUBE_API}/videos?part=snippet`, {
      method: 'PUT',
      body: JSON.stringify({
        id: videoId,
        snippet: {
          title: snippet.title,
          description: snippet.description,
          categoryId: snippet.categoryId,
          tags: snippet.tags,
        },
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`YouTube updateVideo failed (${resp.status}): ${error}`);
    }
  }

  async replyToComment(commentId: string, text: string): Promise<void> {
    const resp = await this.authedRequest(`${YOUTUBE_API}/comments?part=snippet`, {
      method: 'POST',
      body: JSON.stringify({
        snippet: {
          parentId: commentId,
          textOriginal: text,
        },
      }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`YouTube replyToComment failed (${resp.status}): ${error}`);
    }
  }

  isConfigured(): boolean {
    return !!(this.env.YOUTUBE_API_KEY && this.env.YOUTUBE_CHANNEL_ID);
  }

  isOAuthConfigured(): boolean {
    return !!(
      this.env.YOUTUBE_CLIENT_ID &&
      this.env.YOUTUBE_CLIENT_SECRET &&
      this.env.YOUTUBE_REFRESH_TOKEN
    );
  }
}
