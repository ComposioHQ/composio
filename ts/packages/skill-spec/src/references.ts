import type { Scoped } from './build-context';

export type ReferenceCommandSnippet = Scoped & {
  code: string;
  description?: string;
};

export type ReferenceSection = Scoped & {
  title: string;
  body?: string[];
  commands?: ReferenceCommandSnippet[];
};

/**
 * A sidecar markdown file loaded on demand by the agent. Authored separately
 * from the main SKILL.md so the main file stays short.
 */
export type SkillReference = {
  slug: string;
  title: string;
  intro?: string[];
  sections: ReferenceSection[];
};
