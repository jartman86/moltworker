/**
 * Flux Pro tool registrations
 */
import { registerTool } from '../../registry';
import { FluxClient } from './client';
import { downloadAndStore } from '../download';

export function registerFluxTools(): void {
  registerTool(
    {
      name: 'generate_image',
      description:
        'Generate a photorealistic image using Flux Pro 1.1. Best for photography, portraits, landscapes. ~$0.04/image, 10-30s.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed image description including subject, setting, lighting, and style.',
          },
          width: {
            type: 'number',
            description: 'Image width in pixels (default 1024).',
          },
          height: {
            type: 'number',
            description: 'Image height in pixels (default 1024).',
          },
        },
        required: ['prompt'],
      },
    },
    async (input, ctx) => {
      const client = new FluxClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Flux Pro is not configured. Set FLUX_API_KEY secret.', isError: true };
      }

      const prompt = input.prompt as string;
      const width = input.width as number | undefined;
      const height = input.height as number | undefined;

      const imageUrl = await client.generateImage({ prompt, width, height });
      const stored = await downloadAndStore(ctx.bucket, ctx.chatId, imageUrl, 'flux');

      return {
        result: `Image generated successfully!\nPublic path: ${stored.publicPath}\nSize: ${(stored.size / 1024).toFixed(1)} KB\nContent type: ${stored.contentType}\n\nUse send_media_to_chat to send this image to the conversation.`,
      };
    },
    { requiresConfirmation: true },
  );
}
