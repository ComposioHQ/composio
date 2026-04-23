import type { BuildContext } from './build-context';
import type { SkillFrontmatter } from './frontmatter';
import type { SkillReference } from './references';
import type { SkillCommand } from './sections';

/**
 * Pure render callback: given a build context, return markdown lines that the
 * builder concatenates into SKILL.md. Lets skill authors keep version-pinned
 * or feature-gated prose together with the rest of their source.
 */
export type RenderLines = (ctx: BuildContext) => readonly string[];

export type SkillBody = {
  /** Rendered below a `## Default Workflow` heading. Optional. */
  workflow?: RenderLines;
  /** Section headings rendered between workflow and epilogue. */
  commands?: readonly SkillCommand[];
  /** Free-form markdown rendered at the bottom of SKILL.md. */
  epilogue?: RenderLines;
};

/**
 * A directory of files copied verbatim into the built skill alongside the
 * generated SKILL.md and references. Useful for scripts, images, or agents
 * the skill ships with.
 */
export type SkillAsset = {
  /** Absolute path to the source directory on disk. */
  sourceDir: string;
  /** Subdirectory inside the built skill. Defaults to the source basename. */
  targetDir?: string;
};

/**
 * Skills are authored as plain data and built at runtime. The builder walks
 * this structure, applies the build context (platform, channel, features),
 * validates capabilities, and writes the final artifact to disk.
 */
export type SkillSpec = {
  frontmatter: SkillFrontmatter;
  body?: SkillBody;
  references?: readonly SkillReference[];
  assets?: readonly SkillAsset[];
};
