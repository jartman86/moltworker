import { loadSoul } from '../r2/soul';
import { listSkills } from '../r2/skills';

export async function buildSystemPrompt(bucket: R2Bucket): Promise<string> {
  const soul = await loadSoul(bucket);
  const skills = await listSkills(bucket);

  if (skills.length === 0) {
    return soul;
  }

  // Only include skill name + description summaries to keep the system prompt small.
  // Big Earn can call read_skill to load full content when needed.
  const skillIndex = skills
    .map((s) => `- **${s.name}**: ${s.description || '(no description)'}`)
    .join('\n');

  return `${soul}\n\n---\n# Available Skills\n\nYou have ${skills.length} skill documents loaded. These contain detailed playbooks and instructions. Use \`read_skill\` to load any skill's full content before executing a complex task.\n\n${skillIndex}\n\n**IMPORTANT:** When a user asks you to do something that matches a skill (e.g., content creation, media generation, social media strategy), call \`read_skill\` with that skill name FIRST to load the full playbook, then execute it step by step using your tools. Do not wing it from memory — read the skill.`;
}
