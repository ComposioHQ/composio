import { z } from 'zod';
import { CAPABILITIES } from './capabilities';

/**
 * Agent Skills frontmatter with additive fields for Composio-aware installers.
 * The extra fields are ignored by generic installers, so a SKILL.md that uses
 * them still installs cleanly in non-Composio agents.
 */
export const SkillFrontmatterSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9._-]+$/, 'skill name must be filesystem-safe (letters, digits, ._-)'),
    description: z.string().min(1),
    toolkits: z.array(z.string().min(1)).optional(),
    tools: z.array(z.string().min(1)).optional(),
    capabilities: z.array(z.enum(CAPABILITIES)).optional(),
  })
  .strict();

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

/**
 * Serialize frontmatter to the YAML block used at the top of a SKILL.md.
 * Only emits keys that are present, to keep the file identical to what a
 * generic installer would produce.
 */
export const renderFrontmatter = (fm: SkillFrontmatter): string => {
  const lines: string[] = ['---', `name: ${fm.name}`, `description: ${fm.description}`];

  if (fm.toolkits && fm.toolkits.length > 0) {
    lines.push(`toolkits: [${fm.toolkits.join(', ')}]`);
  }
  if (fm.tools && fm.tools.length > 0) {
    lines.push(`tools: [${fm.tools.join(', ')}]`);
  }
  if (fm.capabilities && fm.capabilities.length > 0) {
    lines.push(`capabilities: [${fm.capabilities.join(', ')}]`);
  }

  lines.push('---');
  return lines.join('\n');
};
