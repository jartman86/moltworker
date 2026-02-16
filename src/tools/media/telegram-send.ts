/**
 * Telegram media send tool — sends generated media inline to chat
 */
import { registerTool } from '../registry';
import { TelegramClient } from '../../telegram/api';

export function registerMediaSendTools(): void {
  registerTool(
    {
      name: 'send_media_to_chat',
      description:
        'Send a previously generated image or video to the current Telegram chat. Use this after generate_image, generate_graphic, or generate_video to show the result inline. Does NOT require confirmation (the generation was already approved).',
      input_schema: {
        type: 'object',
        properties: {
          media_url: {
            type: 'string',
            description: 'The public path of the media (e.g., /media/12345/1700000000-flux.png)',
          },
          media_type: {
            type: 'string',
            description: 'Type of media to send',
            enum: ['photo', 'video'],
          },
          caption: {
            type: 'string',
            description: 'Optional caption to display with the media',
          },
        },
        required: ['media_url', 'media_type'],
      },
    },
    async (input, ctx) => {
      if (!ctx.env.TELEGRAM_BOT_TOKEN) {
        return { result: 'Telegram is not configured.', isError: true };
      }
      if (!ctx.env.WORKER_PUBLIC_URL) {
        return { result: 'WORKER_PUBLIC_URL is not configured. Cannot construct media URL.', isError: true };
      }

      const mediaPath = input.media_url as string;
      const mediaType = input.media_type as 'photo' | 'video';
      const caption = input.caption as string | undefined;

      // Construct full public URL
      const baseUrl = ctx.env.WORKER_PUBLIC_URL.replace(/\/$/, '');
      const fullUrl = `${baseUrl}${mediaPath}`;

      const telegram = new TelegramClient(ctx.env.TELEGRAM_BOT_TOKEN);

      if (mediaType === 'photo') {
        await telegram.sendPhoto(ctx.chatId, fullUrl, caption);
      } else {
        await telegram.sendVideo(ctx.chatId, fullUrl, caption);
      }

      return { result: `Media sent to chat successfully.` };
    },
  );
}
