import { R2_KEYS, DEFAULT_SOUL } from '../config';

export async function loadSoul(bucket: R2Bucket): Promise<string> {
  const obj = await bucket.get(R2_KEYS.soul);
  if (!obj) return DEFAULT_SOUL;
  return obj.text();
}

export async function saveSoul(bucket: R2Bucket, content: string): Promise<void> {
  await bucket.put(R2_KEYS.soul, content);
}
