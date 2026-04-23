import type { FeatureFlag, ReleaseChannel, SkillSpec } from '@composio/skill-spec';
import { buildSkill, type BuildSkillResult } from './build';

export type BuildCliSkillOptions = {
  spec: SkillSpec;
  /** `@composio/cli` version the artifact is pinned to, e.g. `0.2.24`. */
  cliVersion: string;
  channel?: ReleaseChannel;
  outputRoot: string;
  featureDefaults?: Readonly<Record<FeatureFlag, boolean>>;
  featureOverrides?: Readonly<Record<FeatureFlag, boolean>>;
  clean?: boolean;
};

/**
 * Build a CLI-targeted skill artifact pinned to a specific `@composio/cli`
 * release. CLI artifacts are always versioned; capabilities unsupported by
 * the CLI platform fail the build.
 */
export const buildCliSkill = (options: BuildCliSkillOptions): BuildSkillResult =>
  buildSkill({
    spec: options.spec,
    target: 'cli',
    channel: options.channel ?? 'stable',
    cliVersion: options.cliVersion,
    outputRoot: options.outputRoot,
    featureDefaults: options.featureDefaults,
    featureOverrides: options.featureOverrides,
    clean: options.clean,
  });
