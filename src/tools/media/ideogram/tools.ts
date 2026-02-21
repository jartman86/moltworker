/**
 * Ideogram tool registrations
 */
import { registerTool } from '../../registry';
import { IdeogramClient } from './client';
import { downloadAndStore } from '../download';

export function registerIdeogramTools(): void {
  registerTool(
    {
      name: 'generate_graphic',
      description:
        'Generate a graphic with text overlays using Ideogram. Best for thumbnails, quote cards, headers. ~$0.04-0.08/image.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Image description with any desired text in quotes.',
          },
          aspect_ratio: {
            type: 'string',
            description: 'Aspect ratio (default ASPECT_1_1).',
            enum: ['ASPECT_1_1', 'ASPECT_16_9', 'ASPECT_9_16', 'ASPECT_4_3', 'ASPECT_3_4'],
          },
          style_type: {
            type: 'string',
            description: 'Style: "DESIGN", "REALISTIC", or "AUTO" (default).',
            enum: ['AUTO', 'DESIGN', 'REALISTIC'],
          },
          magic_prompt: {
            type: 'string',
            description: 'Prompt enhancement: "ON" (default), "OFF", or "AUTO".',
            enum: ['AUTO', 'ON', 'OFF'],
          },
        },
        required: ['prompt'],
      },
    },
    async (input, ctx) => {
      const client = new IdeogramClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Ideogram is not configured. Set IDEOGRAM_API_KEY secret.', isError: true };
      }

      const prompt = input.prompt as string;
      const aspect_ratio = input.aspect_ratio as string | undefined;
      const style_type = input.style_type as string | undefined;
      const magic_prompt_option = input.magic_prompt as string | undefined;

      const imageUrl = await client.generateImage({ prompt, aspect_ratio, style_type, magic_prompt_option });
      const stored = await downloadAndStore(ctx.bucket, ctx.chatId, imageUrl, 'ideogram');

      return {
        result: `Graphic generated successfully!\nPublic path: ${stored.publicPath}\nSize: ${(stored.size / 1024).toFixed(1)} KB\nContent type: ${stored.contentType}\n\nUse send_media_to_chat to send this graphic to the conversation.`,
      };
    },
    { requiresConfirmation: true },
  );
}
