/**
 * Instagram tool registrations
 */
import { registerTool } from '../../registry';
import { InstagramClient } from './client';

export function registerInstagramTools(): void {
  registerTool(
    {
      name: 'get_instagram_profile',
      description: 'Get Instagram profile information including follower count and media count.',
      input_schema: { type: 'object', properties: {} },
    },
    async (_input, ctx) => {
      const client = new InstagramClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Instagram is not configured.', isError: true };
      }
      const profile = await client.getProfile();
      return {
        result: `Instagram Profile: @${profile.username}\nName: ${profile.name}\nFollowers: ${profile.followers_count}\nPosts: ${profile.media_count}`,
      };
    },
  );

  registerTool(
    {
      name: 'get_instagram_media',
      description: 'Get recent Instagram posts with engagement metrics.',
      input_schema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of posts to return (default 10, max 25)' },
        },
      },
    },
    async (input, ctx) => {
      const client = new InstagramClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Instagram is not configured.', isError: true };
      }
      const limit = Math.min((input.limit as number) || 10, 25);
      const media = await client.getMedia(limit);
      if (media.length === 0) return { result: 'No posts found.' };
      const list = media.map((m) =>
        `- [${m.media_type}] "${(m.caption || '').slice(0, 80)}" | Likes: ${m.like_count}, Comments: ${m.comments_count} | ${m.timestamp} | ID: ${m.id}`
      ).join('\n');
      return { result: `Recent posts:\n${list}` };
    },
  );

  registerTool(
    {
      name: 'get_instagram_insights',
      description: 'Get Instagram account insights including impressions, reach, and profile views.',
      input_schema: { type: 'object', properties: {} },
    },
    async (_input, ctx) => {
      const client = new InstagramClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Instagram is not configured.', isError: true };
      }
      const insights = await client.getInsights();
      if (insights.length === 0) return { result: 'No insights data available.' };
      const list = insights.map((i) => {
        const value = i.values?.[0]?.value ?? 'N/A';
        return `- ${i.name}: ${value}`;
      }).join('\n');
      return { result: `Instagram Insights:\n${list}` };
    },
  );

  registerTool(
    {
      name: 'create_instagram_post',
      description: 'Create a new Instagram post with an image and caption.',
      input_schema: {
        type: 'object',
        properties: {
          image_url: { type: 'string', description: 'Public URL of the image to post' },
          caption: { type: 'string', description: 'The post caption' },
        },
        required: ['image_url', 'caption'],
      },
    },
    async (input, ctx) => {
      const client = new InstagramClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Instagram is not configured.', isError: true };
      }
      const post = await client.createPost(input.image_url as string, input.caption as string);
      return { result: `Instagram post published! ID: ${post.id}` };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'reply_to_instagram_comment',
      description: 'Reply to an Instagram comment.',
      input_schema: {
        type: 'object',
        properties: {
          comment_id: { type: 'string', description: 'The comment ID to reply to' },
          message: { type: 'string', description: 'The reply message' },
        },
        required: ['comment_id', 'message'],
      },
    },
    async (input, ctx) => {
      const client = new InstagramClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Instagram is not configured.', isError: true };
      }
      const reply = await client.replyToComment(input.comment_id as string, input.message as string);
      return { result: `Reply posted! ID: ${reply.id}` };
    },
    { requiresConfirmation: true },
  );
}
