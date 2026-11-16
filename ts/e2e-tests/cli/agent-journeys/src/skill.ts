/**
 * The system prompt of every journey: the `composio-cli` skill, built from its
 * source the way `pnpm --filter @composio/cli run build:skills` builds it.
 *
 * Rendering it here, not reading a checked-in copy, is what makes a change to
 * the skill reach these tests.
 */

import {
  renderComposioCliSkill,
  renderReferenceFiles,
} from '../../../../packages/cli/skills-src/composio-cli/index';

/** Where the skill's files sit inside the journey container. */
export const SKILL_DIRECTORY = '/skills/composio-cli';

export interface BuiltSkill {
  /** `SKILL.md`, as an agent host loads it. */
  readonly skillMarkdown: string;
  /** `references/<name>.md`, which `SKILL.md` tells the agent to open when needed. */
  readonly references: Readonly<Record<string, string>>;
}

export const buildSkill = (): BuiltSkill => ({
  skillMarkdown: renderComposioCliSkill('stable'),
  references: renderReferenceFiles('stable'),
});

/**
 * The skill text with the one line an agent host adds when it loads a skill:
 * where its files are, so the relative links in `SKILL.md` can be followed.
 */
export const systemPrompt = (skill: BuiltSkill): string =>
  `Base directory for this skill: ${SKILL_DIRECTORY}\n\n${skill.skillMarkdown}`;
