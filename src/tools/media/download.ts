/**
 * Shared utility: download a URL and store the result in R2
 */
import { storeMedia, type StoredMedia } from '../../r2/media';

const EXT_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

const CONTENT_TYPE_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
};

export async function downloadAndStore(
  bucket: R2Bucket,
  chatId: number,
  sourceUrl: string,
  type: string,
): Promise<StoredMedia> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download media: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.arrayBuffer();
  const contentType = resp.headers.get('content-type') || inferContentType(sourceUrl);
  const ext = EXT_MAP[contentType] || inferExtension(sourceUrl) || 'bin';

  return storeMedia(bucket, chatId, data, type, ext, contentType);
}

function inferContentType(url: string): string {
  const ext = inferExtension(url);
  if (ext && CONTENT_TYPE_MAP[ext]) return CONTENT_TYPE_MAP[ext];
  return 'application/octet-stream';
}

function inferExtension(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(\w+)$/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}
