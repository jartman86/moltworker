import { R2_KEYS } from '../config';

interface AllowlistData {
  userIds: number[];
}

export async function loadAllowlist(bucket: R2Bucket): Promise<number[]> {
  const obj = await bucket.get(R2_KEYS.allowlist);
  if (!obj) return [];

  try {
    const data: AllowlistData = await obj.json();
    return data.userIds || [];
  } catch {
    return [];
  }
}

export async function saveAllowlist(bucket: R2Bucket, ids: number[]): Promise<void> {
  const data: AllowlistData = { userIds: ids };
  await bucket.put(R2_KEYS.allowlist, JSON.stringify(data));
}

export async function isUserAllowed(
  bucket: R2Bucket,
  userId: number,
  envOverride?: string,
): Promise<boolean> {
  // Check env override first (comma-separated user IDs)
  if (envOverride) {
    const envIds = envOverride
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (envIds.length > 0) {
      return envIds.includes(userId);
    }
  }

  // Check R2 allowlist
  const allowlist = await loadAllowlist(bucket);

  // If allowlist is empty, allow all (for initial setup convenience)
  if (allowlist.length === 0) return true;

  return allowlist.includes(userId);
}
