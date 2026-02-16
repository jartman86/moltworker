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
        'Generate a graphic with text overlays using Ideogram. Best for YouTube thumbnails, quote cards, event announcements, social media headers — any image that needs readable text rendered into it. Cost: ~$0.04-0.08 per image.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Image description with exact text in quotes. Example: "Bold YouTube thumbnail with large white text reading \'TOP 10 TIPS\' over a dramatic sunset background, cinematic style"',
          },
          aspect_ratio: {
            type: 'string',
            description: 'Aspect ratio. Options: ASPECT_1_1 (default, Instagram), ASPECT_16_9 (YouTube/Twitter), ASPECT_9_16 (Stories/TikTok), ASPECT_4_3, ASPECT_3_4',
            enum: ['ASPECT_1_1', 'ASPECT_16_9', 'ASPECT_9_16', 'ASPECT_4_3', 'ASPECT_3_4'],
          },
          style_type: {
            type: 'string',
            description: 'Style type. "DESIGN" for clean graphics, "REALISTIC" for photo-composites with text, "AUTO" (default) to let Ideogram decide',
            enum: ['AUTO', 'DESIGN', 'REALISTIC'],
          },
          magic_prompt: {
            type: 'string',
            description: 'Magic prompt enhancement. "ON" for Ideogram to enhance your prompt (default), "OFF" for exact control',
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
