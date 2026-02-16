/**
 * Twitter tool registrations
 */
import { registerTool } from '../../registry';
import { TwitterClient } from './client';

export function registerTwitterTools(): void {
  registerTool(
    {
      name: 'post_tweet',
      description: 'Post a new tweet to Twitter/X.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The tweet text (max 280 characters)' },
        },
        required: ['text'],
      },
    },
    async (input, ctx) => {
      const client = new TwitterClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Twitter is not configured. Missing API credentials.', isError: true };
      }
      const tweet = await client.postTweet(input.text as string);
      return { result: `Tweet posted! ID: ${tweet.id}\nhttps://twitter.com/i/status/${tweet.id}` };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'reply_to_tweet',
      description: 'Reply to an existing tweet.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The reply text' },
          tweet_id: { type: 'string', description: 'The ID of the tweet to reply to' },
        },
        required: ['text', 'tweet_id'],
      },
    },
    async (input, ctx) => {
      const client = new TwitterClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Twitter is not configured.', isError: true };
      }
      const reply = await client.replyToTweet(input.text as string, input.tweet_id as string);
      return { result: `Reply posted! ID: ${reply.id}\nhttps://twitter.com/i/status/${reply.id}` };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'delete_tweet',
      description: 'Delete a tweet by its ID.',
      input_schema: {
        type: 'object',
        properties: {
          tweet_id: { type: 'string', description: 'The ID of the tweet to delete' },
        },
        required: ['tweet_id'],
      },
    },
    async (input, ctx) => {
      const client = new TwitterClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Twitter is not configured.', isError: true };
      }
      await client.deleteTweet(input.tweet_id as string);
      return { result: 'Tweet deleted successfully.' };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'get_mentions',
      description: 'Get recent mentions of the bot on Twitter/X.',
      input_schema: {
        type: 'object',
        properties: {
          max_results: { type: 'number', description: 'Maximum number of mentions to return (default 10, max 100)' },
        },
      },
    },
    async (input, ctx) => {
      const client = new TwitterClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Twitter is not configured.', isError: true };
      }
      const maxResults = Math.min((input.max_results as number) || 10, 100);
      const mentions = await client.getMentions(maxResults);
      if (mentions.length === 0) {
        return { result: 'No recent mentions found.' };
      }
      const list = mentions.map((m) =>
        `- @${m.author_id}: "${m.text}" (${m.created_at}) [ID: ${m.id}]`
      ).join('\n');
      return { result: `Recent mentions:\n${list}` };
    },
  );

  registerTool(
    {
      name: 'get_tweet_analytics',
      description: 'Get engagement metrics for a specific tweet.',
      input_schema: {
        type: 'object',
        properties: {
          tweet_id: { type: 'string', description: 'The tweet ID to get analytics for' },
        },
        required: ['tweet_id'],
      },
    },
    async (input, ctx) => {
      const client = new TwitterClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Twitter is not configured.', isError: true };
      }
      const metrics = await client.getTweetAnalytics(input.tweet_id as string);
      return {
        result: `Tweet analytics:\n- Likes: ${metrics.like_count}\n- Retweets: ${metrics.retweet_count}\n- Replies: ${metrics.reply_count}\n- Impressions: ${metrics.impression_count}`,
      };
    },
  );
}
