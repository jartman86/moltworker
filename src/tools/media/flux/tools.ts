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
        'Generate a photorealistic image using Flux Pro 1.1. Best for photography-style images, portraits, landscapes, product shots. Cost: ~$0.04-0.06 per image. Takes 10-30 seconds.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed image description. Include subject, setting, lighting, camera/lens details, and style. Example: "Professional headshot of a confident woman in a modern office, natural window light, shallow depth of field, 85mm f/1.4, editorial photography"',
          },
          width: {
            type: 'number',
            description: 'Image width in pixels (default 1024). Common: 1024x1024 (square), 1024x576 (landscape), 768x1024 (portrait)',
          },
          height: {
            type: 'number',
            description: 'Image height in pixels (default 1024)',
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
