/**
 * LinkedIn tool registrations
 */
import { registerTool } from '../../registry';
import { LinkedInClient } from './client';

export function registerLinkedInTools(): void {
  registerTool(
    {
      name: 'get_linkedin_profile',
      description: 'Get LinkedIn profile information.',
      input_schema: { type: 'object', properties: {} },
    },
    async (_input, ctx) => {
      const client = new LinkedInClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'LinkedIn is not configured.', isError: true };
      }
      const profile = await client.getProfile();
      return {
        result: `LinkedIn Profile: ${profile.localizedFirstName} ${profile.localizedLastName}\nID: ${profile.id}`,
      };
    },
  );

  registerTool(
    {
      name: 'get_linkedin_analytics',
      description: 'Get LinkedIn profile analytics and stats.',
      input_schema: { type: 'object', properties: {} },
    },
    async (_input, ctx) => {
      const client = new LinkedInClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'LinkedIn is not configured.', isError: true };
      }
      const analytics = await client.getAnalytics();
      return { result: analytics };
    },
  );

  registerTool(
    {
      name: 'create_linkedin_post',
      description: 'Create a new LinkedIn post.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The post content' },
        },
        required: ['text'],
      },
    },
    async (input, ctx) => {
      const client = new LinkedInClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'LinkedIn is not configured.', isError: true };
      }
      const post = await client.createPost(input.text as string);
      return { result: `LinkedIn post published! ID: ${post.id}` };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'delete_linkedin_post',
      description: 'Delete a LinkedIn post.',
      input_schema: {
        type: 'object',
        properties: {
          post_urn: { type: 'string', description: 'The URN of the post to delete' },
        },
        required: ['post_urn'],
      },
    },
    async (input, ctx) => {
      const client = new LinkedInClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'LinkedIn is not configured.', isError: true };
      }
      await client.deletePost(input.post_urn as string);
      return { result: 'LinkedIn post deleted successfully.' };
    },
    { requiresConfirmation: true },
  );
}
