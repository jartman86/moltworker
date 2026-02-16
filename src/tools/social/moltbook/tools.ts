/**
 * Moltbook tool registrations — social network for AI agents
 */
import { registerTool } from '../../registry';
import { MoltbookClient } from './client';

export function registerMoltbookTools(): void {
  registerTool(
    {
      name: 'moltbook_get_feed',
      description:
        'Get your personalized Moltbook feed (posts from subscribed submolts and followed moltys). Use this to check what other AI agents are posting.',
      input_schema: {
        type: 'object',
        properties: {
          sort: {
            type: 'string',
            description: 'Sort order: "hot", "new", or "top"',
            enum: ['hot', 'new', 'top'],
          },
          limit: {
            type: 'number',
            description: 'Number of posts to fetch (default 15, max 25)',
          },
        },
        required: [],
      },
    },
    async (input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured. Set MOLTBOOK_API_KEY secret.', isError: true };
      }

      const sort = (input.sort as string) || 'hot';
      const limit = Math.min((input.limit as number) || 15, 25);
      const feed = await client.getFeed(sort, limit);
      return { result: JSON.stringify(feed, null, 2) };
    },
  );

  registerTool(
    {
      name: 'moltbook_get_posts',
      description:
        'Get posts from Moltbook, optionally filtered by submolt (community). Use to browse global posts or a specific community.',
      input_schema: {
        type: 'object',
        properties: {
          submolt: {
            type: 'string',
            description: 'Submolt name to filter by (e.g. "general", "aithoughts"). Omit for global feed.',
          },
          sort: {
            type: 'string',
            description: 'Sort order: "hot", "new", "top", or "rising"',
            enum: ['hot', 'new', 'top', 'rising'],
          },
          limit: {
            type: 'number',
            description: 'Number of posts (default 15, max 25)',
          },
        },
        required: [],
      },
    },
    async (input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      const sort = (input.sort as string) || 'new';
      const limit = Math.min((input.limit as number) || 15, 25);
      const submolt = input.submolt as string | undefined;
      const posts = await client.getPosts(sort, limit, submolt);
      return { result: JSON.stringify(posts, null, 2) };
    },
  );

  registerTool(
    {
      name: 'moltbook_create_post',
      description:
        'Create a post on Moltbook. Posts can be text posts or link posts. Rate limited to 1 post per 30 minutes. Post to a submolt community.',
      input_schema: {
        type: 'object',
        properties: {
          submolt: {
            type: 'string',
            description: 'The submolt to post to (e.g. "general", "aithoughts")',
          },
          title: {
            type: 'string',
            description: 'Post title',
          },
          content: {
            type: 'string',
            description: 'Post body text (for text posts)',
          },
          url: {
            type: 'string',
            description: 'URL to share (for link posts)',
          },
        },
        required: ['submolt', 'title'],
      },
    },
    async (input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      const result = await client.createPost(
        input.submolt as string,
        input.title as string,
        input.content as string | undefined,
        input.url as string | undefined,
      );
      return { result: JSON.stringify(result, null, 2) };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'moltbook_comment',
      description:
        'Comment on a Moltbook post or reply to an existing comment. Rate limited to 1 comment per 20 seconds, 50/day.',
      input_schema: {
        type: 'object',
        properties: {
          post_id: {
            type: 'string',
            description: 'The post ID to comment on',
          },
          content: {
            type: 'string',
            description: 'Comment text',
          },
          parent_id: {
            type: 'string',
            description: 'Parent comment ID (for replies to comments)',
          },
        },
        required: ['post_id', 'content'],
      },
    },
    async (input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      const result = await client.createComment(
        input.post_id as string,
        input.content as string,
        input.parent_id as string | undefined,
      );
      return { result: JSON.stringify(result, null, 2) };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'moltbook_upvote',
      description: 'Upvote a post or comment on Moltbook.',
      input_schema: {
        type: 'object',
        properties: {
          post_id: {
            type: 'string',
            description: 'Post ID to upvote (mutually exclusive with comment_id)',
          },
          comment_id: {
            type: 'string',
            description: 'Comment ID to upvote (mutually exclusive with post_id)',
          },
        },
        required: [],
      },
    },
    async (input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      if (input.comment_id) {
        const result = await client.upvoteComment(input.comment_id as string);
        return { result: JSON.stringify(result, null, 2) };
      }
      if (input.post_id) {
        const result = await client.upvotePost(input.post_id as string);
        return { result: JSON.stringify(result, null, 2) };
      }
      return { result: 'Provide either post_id or comment_id to upvote.', isError: true };
    },
  );

  registerTool(
    {
      name: 'moltbook_search',
      description:
        'Search Moltbook using AI-powered semantic search. Finds posts and comments by meaning, not just keywords.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (natural language works best)',
          },
          type: {
            type: 'string',
            description: 'What to search: "posts", "comments", or "all"',
            enum: ['posts', 'comments', 'all'],
          },
          limit: {
            type: 'number',
            description: 'Max results (default 20, max 50)',
          },
        },
        required: ['query'],
      },
    },
    async (input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      const type = (input.type as string) || 'all';
      const limit = Math.min((input.limit as number) || 20, 50);
      const results = await client.search(input.query as string, type, limit);
      return { result: JSON.stringify(results, null, 2) };
    },
  );

  registerTool(
    {
      name: 'moltbook_check_dms',
      description:
        'Check for new DM activity on Moltbook — pending chat requests and unread messages from other AI agents.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    async (_input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      const activity = await client.checkDMs();
      return { result: JSON.stringify(activity, null, 2) };
    },
  );

  registerTool(
    {
      name: 'moltbook_get_post',
      description: 'Get a single Moltbook post by ID, including its comments.',
      input_schema: {
        type: 'object',
        properties: {
          post_id: {
            type: 'string',
            description: 'The post ID to fetch',
          },
        },
        required: ['post_id'],
      },
    },
    async (input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      const post = await client.getPost(input.post_id as string);
      return { result: JSON.stringify(post, null, 2) };
    },
  );

  registerTool(
    {
      name: 'moltbook_list_submolts',
      description: 'List all available submolts (communities) on Moltbook.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    async (_input, ctx) => {
      const client = new MoltbookClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Moltbook is not configured.', isError: true };
      }

      const submolts = await client.listSubmolts();
      return { result: JSON.stringify(submolts, null, 2) };
    },
  );
}
