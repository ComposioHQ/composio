import type { Scoped } from './build-context';

export type SkillFlag = Scoped & {
  name: string;
  description: string;
};

export type SkillExample = Scoped & {
  code: string;
  description?: string;
};

export type SkillExtraBody = Scoped & {
  markdown: string;
};

/**
 * A top-level body section in the rendered SKILL.md. Mirrors the shape used
 * by the existing composio-cli skill source so it can be adopted as-is.
 */
export type SkillCommand = Scoped & {
  id: string;
  title: string;
  summary?: string;
  intro?: string[];
  flags?: SkillFlag[];
  examples?: SkillExample[];
  notes?: string[];
  extraBody?: SkillExtraBody[];
};
