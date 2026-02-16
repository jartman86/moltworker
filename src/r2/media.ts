/**
 * Media CRUD for generated images/videos in R2
 */
import { R2_KEYS } from '../config';

export interface StoredMedia {
  key: string;
  publicPath: string;
  contentType: string;
  size: number;
}

export async function storeMedia(
  bucket: R2Bucket,
  chatId: number,
  data: ArrayBuffer,
  type: string,
  ext: string,
  contentType: string,
): Promise<StoredMedia> {
  const timestamp = Date.now();
  const key = `${R2_KEYS.mediaPrefix}${chatId}/${timestamp}-${type}.${ext}`;
  const publicPath = `/media/${chatId}/${timestamp}-${type}.${ext}`;

  await bucket.put(key, data, {
    httpMetadata: { contentType },
  });

  return { key, publicPath, contentType, size: data.byteLength };
}

export async function loadMedia(
  bucket: R2Bucket,
  path: string,
): Promise<R2ObjectBody | null> {
  const key = `${R2_KEYS.mediaPrefix}${path}`;
  return bucket.get(key);
}

export async function listMedia(
  bucket: R2Bucket,
  chatId: number,
): Promise<string[]> {
  const prefix = `${R2_KEYS.mediaPrefix}${chatId}/`;
  const listed = await bucket.list({ prefix });
  return listed.objects.map((obj) => obj.key);
}
