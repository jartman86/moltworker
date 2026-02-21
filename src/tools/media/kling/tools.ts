/**
 * Kling video tool registrations (via fal.ai)
 */
import { registerTool } from '../../registry';
import { KlingClient } from './client';
import { downloadAndStore } from '../download';

export function registerKlingTools(): void {
  registerTool(
    {
      name: 'generate_video',
      description:
        'Generate a cinematic video clip using Kling 2.5 Turbo. ~$0.35/5s clip, 1-5 min.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed video description with camera movement, subject, environment, and mood.',
          },
          negative_prompt: {
            type: 'string',
            description: 'What to avoid (default: "blur, distort, and low quality").',
          },
          duration: {
            type: 'string',
            description: 'Video duration: "5" or "10" seconds.',
            enum: ['5', '10'],
          },
          aspect_ratio: {
            type: 'string',
            description: 'Aspect ratio: "16:9", "9:16", or "1:1".',
            enum: ['16:9', '9:16', '1:1'],
          },
        },
        required: ['prompt'],
      },
    },
    async (input, ctx) => {
      const client = new KlingClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Kling (fal.ai) is not configured. Set FAL_API_KEY secret.', isError: true };
      }

      const prompt = input.prompt as string;
      const negative_prompt = (input.negative_prompt as string) || 'blur, distort, and low quality';
      const duration = input.duration as string | undefined;
      const aspect_ratio = input.aspect_ratio as string | undefined;

      const { videoUrl, duration: videoDuration } = await client.generateVideo({
        prompt,
        negative_prompt,
        duration,
        aspect_ratio,
      });

      const stored = await downloadAndStore(ctx.bucket, ctx.chatId, videoUrl, 'kling');

      return {
        result: `Video generated successfully!\nPublic path: ${stored.publicPath}\nDuration: ${videoDuration}s\nSize: ${(stored.size / (1024 * 1024)).toFixed(1)} MB\nContent type: ${stored.contentType}\n\nUse send_media_to_chat to send this video to the conversation.`,
      };
    },
    { requiresConfirmation: true },
  );
}
