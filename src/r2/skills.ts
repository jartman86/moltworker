import { R2_KEYS } from '../config';

export interface SkillMeta {
  name: string;
  description: string;
}

export interface Skill extends SkillMeta {
  content: string;
}

/** Parse YAML-ish frontmatter from a skill document */
function parseFrontmatter(content: string): { meta: SkillMeta; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { meta: { name: 'unknown', description: '' }, body: content };
  }

  const frontmatter = match[1];
  const body = match[2];

  let name = 'unknown';
  let description = '';

  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim();
    const descMatch = line.match(/^description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim();
  }

  return { meta: { name, description }, body };
}

export async function listSkills(bucket: R2Bucket): Promise<SkillMeta[]> {
  const listed = await bucket.list({ prefix: R2_KEYS.skillsPrefix });
  const skills: SkillMeta[] = [];

  for (const obj of listed.objects) {
    const key = obj.key;
    if (!key.endsWith('.md')) continue;

    const content = await bucket.get(key);
    if (!content) continue;

    const text = await content.text();
    const { meta } = parseFrontmatter(text);
    const name = key.slice(R2_KEYS.skillsPrefix.length, -3); // strip prefix and .md
    skills.push({ name, description: meta.description });
  }

  return skills;
}

export async function loadSkills(bucket: R2Bucket): Promise<Skill[]> {
  const listed = await bucket.list({ prefix: R2_KEYS.skillsPrefix });
  const skills: Skill[] = [];

  for (const obj of listed.objects) {
    const key = obj.key;
    if (!key.endsWith('.md')) continue;

    const content = await bucket.get(key);
    if (!content) continue;

    const text = await content.text();
    const { meta } = parseFrontmatter(text);
    const name = key.slice(R2_KEYS.skillsPrefix.length, -3);
    skills.push({ name, description: meta.description, content: text });
  }

  return skills;
}

export async function loadSkill(bucket: R2Bucket, name: string): Promise<string | null> {
  const obj = await bucket.get(`${R2_KEYS.skillsPrefix}${name}.md`);
  if (!obj) return null;
  return obj.text();
}

export async function saveSkill(bucket: R2Bucket, name: string, content: string): Promise<void> {
  await bucket.put(`${R2_KEYS.skillsPrefix}${name}.md`, content);
}

export async function deleteSkill(bucket: R2Bucket, name: string): Promise<void> {
  await bucket.delete(`${R2_KEYS.skillsPrefix}${name}.md`);
}
