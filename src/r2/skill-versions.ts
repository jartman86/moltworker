/**
 * Skill version history and rollback
 */
import { R2_KEYS } from '../config';
import { loadSkill, saveSkill } from './skills';

const MAX_VERSIONS = 10;

export interface SkillVersion {
  name: string;
  timestamp: number;
  content: string;
}

export async function saveSkillVersion(
  bucket: R2Bucket,
  name: string,
  content: string,
): Promise<void> {
  const timestamp = Date.now();
  const key = `${R2_KEYS.skillVersionsPrefix}${name}/${timestamp}.md`;
  await bucket.put(key, content);

  // Prune old versions beyond MAX_VERSIONS
  const versions = await listSkillVersions(bucket, name);
  if (versions.length > MAX_VERSIONS) {
    const toDelete = versions.slice(MAX_VERSIONS);
    for (const v of toDelete) {
      const deleteKey = `${R2_KEYS.skillVersionsPrefix}${name}/${v.timestamp}.md`;
      await bucket.delete(deleteKey);
    }
  }
}

export async function listSkillVersions(
  bucket: R2Bucket,
  name: string,
): Promise<{ timestamp: number }[]> {
  const prefix = `${R2_KEYS.skillVersionsPrefix}${name}/`;
  const listed = await bucket.list({ prefix });
  const versions: { timestamp: number }[] = [];

  for (const obj of listed.objects) {
    const filename = obj.key.slice(prefix.length);
    const timestamp = parseInt(filename.replace('.md', ''), 10);
    if (!isNaN(timestamp)) {
      versions.push({ timestamp });
    }
  }

  return versions.sort((a, b) => b.timestamp - a.timestamp);
}

export async function loadSkillVersion(
  bucket: R2Bucket,
  name: string,
  timestamp: number,
): Promise<string | null> {
  const key = `${R2_KEYS.skillVersionsPrefix}${name}/${timestamp}.md`;
  const obj = await bucket.get(key);
  if (!obj) return null;
  return obj.text();
}

export async function restoreSkillVersion(
  bucket: R2Bucket,
  name: string,
  timestamp: number,
): Promise<boolean> {
  const versionContent = await loadSkillVersion(bucket, name, timestamp);
  if (!versionContent) return false;

  // Save the current version before overwriting
  const current = await loadSkill(bucket, name);
  if (current) {
    await saveSkillVersion(bucket, name, current);
  }

  await saveSkill(bucket, name, versionContent);
  return true;
}
