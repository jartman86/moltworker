/**
 * YouTube tool registrations
 */
import { registerTool } from '../../registry';
import { YouTubeClient } from './client';

export function registerYouTubeTools(): void {
  registerTool(
    {
      name: 'get_channel_stats',
      description: 'Get YouTube channel statistics including subscriber count, video count, and total views.',
      input_schema: { type: 'object', properties: {} },
    },
    async (_input, ctx) => {
      const client = new YouTubeClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'YouTube is not configured. Missing API key or channel ID.', isError: true };
      }
      const stats = await client.getChannelStats();
      return {
        result: `Channel: ${stats.title}\nSubscribers: ${stats.subscriberCount}\nVideos: ${stats.videoCount}\nTotal Views: ${stats.viewCount}`,
      };
    },
  );

  registerTool(
    {
      name: 'list_youtube_videos',
      description: 'List recent YouTube videos with their stats.',
      input_schema: {
        type: 'object',
        properties: {
          max_results: { type: 'number', description: 'Number of videos to return (default 10, max 50)' },
        },
      },
    },
    async (input, ctx) => {
      const client = new YouTubeClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'YouTube is not configured.', isError: true };
      }
      const maxResults = Math.min((input.max_results as number) || 10, 50);
      const videos = await client.listVideos(maxResults);
      if (videos.length === 0) return { result: 'No videos found.' };
      const list = videos.map((v) =>
        `- **${v.title}** (${v.viewCount} views, ${v.publishedAt})\n  ID: ${v.id} | https://youtube.com/watch?v=${v.id}`
      ).join('\n');
      return { result: `Recent videos:\n${list}` };
    },
  );

  registerTool(
    {
      name: 'get_video_stats',
      description: 'Get detailed statistics for a specific YouTube video.',
      input_schema: {
        type: 'object',
        properties: {
          video_id: { type: 'string', description: 'The YouTube video ID' },
        },
        required: ['video_id'],
      },
    },
    async (input, ctx) => {
      const client = new YouTubeClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'YouTube is not configured.', isError: true };
      }
      const stats = await client.getVideoStats(input.video_id as string);
      return {
        result: `Video: ${stats.title}\nViews: ${stats.viewCount}\nLikes: ${stats.likeCount}\nComments: ${stats.commentCount}`,
      };
    },
  );

  registerTool(
    {
      name: 'update_youtube_video',
      description: 'Update the title and/or description of a YouTube video.',
      input_schema: {
        type: 'object',
        properties: {
          video_id: { type: 'string', description: 'The YouTube video ID' },
          title: { type: 'string', description: 'New title (optional)' },
          description: { type: 'string', description: 'New description (optional)' },
        },
        required: ['video_id'],
      },
    },
    async (input, ctx) => {
      const client = new YouTubeClient(ctx.env);
      if (!client.isOAuthConfigured()) {
        return { result: 'YouTube OAuth is not configured. Missing client credentials.', isError: true };
      }
      await client.updateVideo(
        input.video_id as string,
        input.title as string | undefined,
        input.description as string | undefined,
      );
      return { result: 'Video updated successfully.' };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'reply_to_youtube_comment',
      description: 'Reply to a YouTube comment.',
      input_schema: {
        type: 'object',
        properties: {
          comment_id: { type: 'string', description: 'The comment ID to reply to' },
          text: { type: 'string', description: 'The reply text' },
        },
        required: ['comment_id', 'text'],
      },
    },
    async (input, ctx) => {
      const client = new YouTubeClient(ctx.env);
      if (!client.isOAuthConfigured()) {
        return { result: 'YouTube OAuth is not configured.', isError: true };
      }
      await client.replyToComment(input.comment_id as string, input.text as string);
      return { result: 'Reply posted successfully.' };
    },
    { requiresConfirmation: true },
  );
}
