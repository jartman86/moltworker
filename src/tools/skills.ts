/**
 * Skill management tools — list, read, update
 */
import { registerTool } from './registry';
import { listSkills, loadSkill, saveSkill } from '../r2/skills';
import { loadSoul, saveSoul } from '../r2/soul';
import { saveSkillVersion } from '../r2/skill-versions';

export function registerSkillTools(): void {
  registerTool(
    {
      name: 'list_skills',
      description:
        'List all your skills with their names and descriptions. Use this to see what skills you have available.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    async (_input, ctx) => {
      const skills = await listSkills(ctx.bucket);
      if (skills.length === 0) {
        return { result: 'No skills found.' };
      }
      const list = skills
        .map((s) => `- **${s.name}**: ${s.description || '(no description)'}`)
        .join('\n');
      return { result: list };
    },
  );

  registerTool(
    {
      name: 'read_skill',
      description:
        'Read the full content of a specific skill document.',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the skill to read',
          },
        },
        required: ['name'],
      },
    },
    async (input, ctx) => {
      const name = input.name as string;
      const content = await loadSkill(ctx.bucket, name);
      if (!content) {
        return { result: `Skill "${name}" not found.`, isError: true };
      }
      return { result: content };
    },
  );

  registerTool(
    {
      name: 'update_skill',
      description:
        'Create or update a skill document. The content should be in markdown format with YAML frontmatter containing name and description fields.',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the skill (kebab-case)',
          },
          content: {
            type: 'string',
            description: 'The full markdown content of the skill, including frontmatter',
          },
        },
        required: ['name', 'content'],
      },
    },
    async (input, ctx) => {
      const name = input.name as string;
      const content = input.content as string;

      // Save current version before overwriting
      const existing = await loadSkill(ctx.bucket, name);
      if (existing) {
        await saveSkillVersion(ctx.bucket, name, existing);
      }

      await saveSkill(ctx.bucket, name, content);
      return {
        result: existing
          ? `Skill "${name}" updated successfully. Previous version saved to history.`
          : `Skill "${name}" created successfully.`,
      };
    },
    { requiresConfirmation: true },
  );

  registerTool(
    {
      name: 'read_soul',
      description:
        'Read your soul.md — your core identity, personality, and instructions. This is the system prompt that defines who you are.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    async (_input, ctx) => {
      const content = await loadSoul(ctx.bucket);
      return { result: content };
    },
  );

  registerTool(
    {
      name: 'update_soul',
      description:
        'Update your soul.md — your core identity and instructions. Use with care. The content should be in markdown format.',
      input_schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The full markdown content for soul.md',
          },
        },
        required: ['content'],
      },
    },
    async (input, ctx) => {
      const content = input.content as string;
      await saveSoul(ctx.bucket, content);
      return { result: 'Soul updated successfully. Changes take effect on the next message.' };
    },
    { requiresConfirmation: true },
  );
}
