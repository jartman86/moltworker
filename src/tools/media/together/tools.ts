/**
 * Together.ai tool registrations — budget-friendly image generation
 */
import { registerTool } from '../../registry';
import { TogetherClient } from './client';
import { storeMedia } from '../../../r2/media';

export function registerTogetherTools(): void {
  registerTool(
    {
      name: 'generate_image_fast',
      description:
        'Generate an image quickly and cheaply using Flux Schnell via Together.ai. Cost: ~$0.003 per image (20x cheaper than Flux Pro). Good for drafts, iterations, social posts, and any case where speed and cost matter more than maximum quality. Use generate_image (Flux Pro) only when photorealistic perfection is needed.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Image description. Same prompt style as generate_image works here. Example: "Golden retriever playing in autumn leaves, warm sunlight, shallow depth of field, 85mm photography"',
          },
          width: {
            type: 'number',
            description: 'Image width in pixels (default 1024). Common: 1024x1024 (square), 1024x576 (landscape), 768x1024 (portrait)',
          },
          height: {
            type: 'number',
            description: 'Image height in pixels (default 1024)',
          },
          steps: {
            type: 'number',
            description: 'Number of inference steps (default 4). Higher = better quality but slower. Range: 1-8.',
          },
        },
        required: ['prompt'],
      },
    },
    async (input, ctx) => {
      const client = new TogetherClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Together.ai is not configured. Set TOGETHER_API_KEY secret.', isError: true };
      }

      const prompt = input.prompt as string;
      const width = input.width as number | undefined;
      const height = input.height as number | undefined;
      const steps = input.steps as number | undefined;

      const imageData = await client.generateImage({ prompt, width, height, steps });
      const stored = await storeMedia(ctx.bucket, ctx.chatId, imageData, 'together', 'png', 'image/png');

      return {
        result: `Image generated successfully (Flux Schnell)!\nPublic path: ${stored.publicPath}\nSize: ${(stored.size / 1024).toFixed(1)} KB\nCost: ~$0.003\n\nUse send_media_to_chat to send this image to the conversation.`,
      };
    },
    { requiresConfirmation: true },
  );
}
