import * as path from 'node:path';
import {
  buildContextVersion,
  checkCapabilitySupport,
  resolveBuildContext,
  validateSkillSpec,
  type BuildContext,
  type FeatureFlag,
  type Platform,
  type ReleaseChannel,
  type SkillArtifactVersion,
  type SkillSpec,
} from '@composio/skill-spec';
import { copyDir, resetDir, writeText } from './fs-utils';
import { renderSkillMarkdown, renderSkillReferences } from './render-skill';

export type BuildSkillOptions = {
  spec: SkillSpec;
  /** Delivery target for the built artifact. */
  target: Platform;
  /** Release channel for the build. Defaults to `stable`. */
  channel?: ReleaseChannel;
  /**
   * Required when `target === 'cli'`. Pins the artifact to a specific
   * `@composio/cli` release (e.g. `0.2.24` or `0.2.25-beta.12`).
   */
  cliVersion?: string;
  /** Absolute path to the directory the built skill will be written into. */
  outputRoot: string;
  /** Default feature values before overrides are applied. */
  featureDefaults?: Readonly<Record<FeatureFlag, boolean>>;
  /** Per-build overrides that win over `featureDefaults`. */
  featureOverrides?: Readonly<Record<FeatureFlag, boolean>>;
  /**
   * If true, delete and recreate the skill output directory before writing.
   * Default: true.
   */
  clean?: boolean;
};

export type BuildSkillResult = {
  /** Directory the skill was written to. Equal to `<outputRoot>/<skill-name>`. */
  skillDir: string;
  context: BuildContext;
  version: SkillArtifactVersion;
};

export class SkillBuildError extends Error {
  readonly errors: readonly string[];
  constructor(message: string, errors: readonly string[]) {
    super(`${message}\n- ${errors.join('\n- ')}`);
    this.name = 'SkillBuildError';
    this.errors = errors;
  }
}

/**
 * Build a skill for a specific platform. Fails fast if:
 *   - the spec's frontmatter is malformed,
 *   - the target platform cannot satisfy a declared capability, or
 *   - CLI is the target but no `cliVersion` was supplied.
 *
 * Writes SKILL.md, references/*.md, and copies asset directories into
 * `<outputRoot>/<skill-name>/`. Safe to call repeatedly: the skill
 * directory is replaced atomically per build (when `clean` is true).
 */
export const buildSkill = (options: BuildSkillOptions): BuildSkillResult => {
  const { spec, target } = options;

  const specErrors = validateSkillSpec(spec).map(e => `${e.path}: ${e.message}`);
  if (specErrors.length > 0) {
    throw new SkillBuildError(`Invalid skill spec for "${spec.frontmatter.name}"`, specErrors);
  }

  const declaredCapabilities = spec.frontmatter.capabilities ?? [];
  const missing = checkCapabilitySupport(target, declaredCapabilities);
  if (missing.length > 0) {
    throw new SkillBuildError(
      `Skill "${spec.frontmatter.name}" is not available for platform "${target}"`,
      missing.map(cap => `capability "${cap}" is not supported on ${target}`)
    );
  }

  const ctx = resolveBuildContext({
    channel: options.channel ?? 'stable',
    platform: target,
    cliVersion: options.cliVersion,
    defaults: options.featureDefaults,
    featureOverrides: options.featureOverrides,
    declaredCapabilities,
  });

  const skillDir = path.join(options.outputRoot, spec.frontmatter.name);
  if (options.clean !== false) {
    resetDir(skillDir);
  }

  writeText(path.join(skillDir, 'SKILL.md'), renderSkillMarkdown(spec, ctx));

  const references = spec.references ?? [];
  if (references.length > 0) {
    const referencesDir = path.join(skillDir, 'references');
    const rendered = renderSkillReferences(references, ctx);
    for (const [fileName, markdown] of Object.entries(rendered)) {
      writeText(path.join(referencesDir, fileName), markdown);
    }
  }

  for (const asset of spec.assets ?? []) {
    const targetDir = path.join(skillDir, asset.targetDir ?? path.basename(asset.sourceDir));
    copyDir(asset.sourceDir, targetDir);
  }

  return { skillDir, context: ctx, version: buildContextVersion(ctx) };
};
