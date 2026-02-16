/**
 * Kling AI tool registrations
 */
import { registerTool } from '../../registry';
import { KlingClient } from './client';
import { downloadAndStore } from '../download';

export function registerKlingTools(): void {
  registerTool(
    {
      name: 'generate_video',
      description:
        'Generate a cinematic video clip using Kling AI. Best for motion content: drone shots, cinematic sequences, product reveals, social media video clips. Cost: ~$0.10-0.20 per clip. Takes 1-5 minutes.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed video description. Structure: [Camera movement] + [Subject] + [Environment] + [Lighting/mood] + [Style]. Example: "Slow dolly in on a steaming cup of coffee on a wooden table, golden hour sunlight streaming through window, warm cinematic color grading, shallow depth of field"',
          },
          negative_prompt: {
            type: 'string',
            description: 'What to avoid. Default recommended: "blurry, low quality, watermark, text overlay, jittery, distorted"',
          },
          duration: {
            type: 'string',
            description: 'Video duration: "5" for 5-second punchy clips, "10" for longer cinematic sequences',
            enum: ['5', '10'],
          },
          aspect_ratio: {
            type: 'string',
            description: 'Aspect ratio: "16:9" for YouTube/landscape, "9:16" for TikTok/Reels/Shorts, "1:1" for Instagram',
            enum: ['16:9', '9:16', '1:1'],
          },
        },
        required: ['prompt'],
      },
    },
    async (input, ctx) => {
      const client = new KlingClient(ctx.env);
      if (!client.isConfigured()) {
        return { result: 'Kling AI is not configured. Set KLING_ACCESS_KEY and KLING_SECRET_KEY secrets.', isError: true };
      }

      const prompt = input.prompt as string;
      const negative_prompt = (input.negative_prompt as string) || 'blurry, low quality, watermark, text overlay, jittery, distorted';
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
        result: `Video generated successfully!\nPublic path: ${stored.publicPath}\nDuration: ${videoDuration || duration || '5'}s\nSize: ${(stored.size / (1024 * 1024)).toFixed(1)} MB\nContent type: ${stored.contentType}\n\nUse send_media_to_chat to send this video to the conversation.`,
      };
    },
    { requiresConfirmation: true },
  );
}
