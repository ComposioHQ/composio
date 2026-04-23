import type { FeatureFlag, ReleaseChannel, SkillSpec } from '@composio/skill-spec';
import { buildSkill, type BuildSkillResult } from './build';

export type BuildMcpSkillOptions = {
  spec: SkillSpec;
  /**
   * Channel the MCP artifact is rendered for. MCP has no version concept
   * today, so this only affects feature defaults. Default: `stable`.
   */
  channel?: ReleaseChannel;
  outputRoot: string;
  featureDefaults?: Readonly<Record<FeatureFlag, boolean>>;
  featureOverrides?: Readonly<Record<FeatureFlag, boolean>>;
  clean?: boolean;
};

/**
 * Build an MCP-targeted skill artifact. MCP builds are not version-pinned —
 * they are rebuilt whenever the source spec changes.
 */
export const buildMcpSkill = (options: BuildMcpSkillOptions): BuildSkillResult =>
  buildSkill({
    spec: options.spec,
    target: 'mcp',
    channel: options.channel ?? 'stable',
    outputRoot: options.outputRoot,
    featureDefaults: options.featureDefaults,
    featureOverrides: options.featureOverrides,
    clean: options.clean,
  });
