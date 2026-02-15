import { loadSoul } from '../r2/soul';
import { loadSkills } from '../r2/skills';

export async function buildSystemPrompt(bucket: R2Bucket): Promise<string> {
  const soul = await loadSoul(bucket);
  const skills = await loadSkills(bucket);

  if (skills.length === 0) {
    return soul;
  }

  const skillSections = skills
    .map((s) => `## ${s.name}\n${s.content}`)
    .join('\n\n');

  return `${soul}\n\n---\n# Skills\n\n${skillSections}`;
}
