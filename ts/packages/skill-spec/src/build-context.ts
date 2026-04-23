import type { Capability } from './capabilities';
import type { Platform } from './platforms';

/**
 * CLI builds are version-pinned. Channel picks the default experimental-feature
 * set; `cliVersion` pins the artifact to a specific `@composio/cli` release so
 * the SKILL can document exactly which CLI it was built against.
 */
export const RELEASE_CHANNELS = ['stable', 'beta'] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

/**
 * A fully-qualified skill artifact version.
 *
 * CLI artifacts produce `{ cli: { channel, version } }`; MCP artifacts are
 * unversioned today and produce `{}`. A hash is always emitted so callers
 * can detect content drift independently of the platform versioning story.
 */
export type SkillArtifactVersion = {
  cli?: {
    channel: ReleaseChannel;
    /** Resolved `@composio/cli` release, e.g. `0.2.24` or `0.2.25-beta.12`. */
    version: string;
  };
};

/**
 * Feature flag keys are opaque strings so each skill can declare its own
 * runtime toggles without this package needing to know the union upfront.
 * The `composio-cli` skill, for example, uses `listen` and `multi_account`.
 */
export type FeatureFlag = string;

export type FeatureScoped = {
  /**
   * If present, this fragment is only rendered when every listed feature
   * resolves to `true` in the build context.
   */
  features?: readonly FeatureFlag[];
};

export type PlatformScoped = {
  /**
   * If present, this fragment is only rendered when the build target is one
   * of the listed platforms. Defaults to all platforms.
   */
  platforms?: readonly Platform[];
};

export type Scoped = FeatureScoped & PlatformScoped;

export type BuildContext = {
  channel: ReleaseChannel;
  platform: Platform;
  /**
   * Pinned CLI version for this build. Required when `platform === 'cli'`,
   * undefined for MCP builds (MCP has no version concept yet).
   */
  cliVersion?: string;
  /** Resolved feature toggles. Unlisted features are treated as `false`. */
  features: Readonly<Record<FeatureFlag, boolean>>;
  /** Capabilities the skill declared in its frontmatter. */
  declaredCapabilities: ReadonlySet<Capability>;
};

export type BuildContextInput = {
  channel: ReleaseChannel;
  platform: Platform;
  /**
   * `@composio/cli` release the artifact is being built against. Required
   * for CLI builds so the rendered SKILL.md can pin itself to that version.
   */
  cliVersion?: string;
  /**
   * Default feature values, typically keyed on the CLI's experimental-feature
   * constants. Overrides in `featureOverrides` win.
   */
  defaults?: Readonly<Record<FeatureFlag, boolean>>;
  featureOverrides?: Readonly<Record<FeatureFlag, boolean>>;
  declaredCapabilities?: readonly Capability[];
};

export const resolveBuildContext = (input: BuildContextInput): BuildContext => {
  if (input.platform === 'cli' && !input.cliVersion) {
    throw new Error('cliVersion is required for CLI builds');
  }

  return {
    channel: input.channel,
    platform: input.platform,
    cliVersion: input.cliVersion,
    features: { ...(input.defaults ?? {}), ...(input.featureOverrides ?? {}) },
    declaredCapabilities: new Set(input.declaredCapabilities ?? []),
  };
};

export const buildContextVersion = (ctx: BuildContext): SkillArtifactVersion =>
  ctx.platform === 'cli' && ctx.cliVersion
    ? { cli: { channel: ctx.channel, version: ctx.cliVersion } }
    : {};

export const isEnabledForBuild = (ctx: BuildContext, scope?: Scoped): boolean => {
  if (!scope) return true;
  if (scope.platforms && !scope.platforms.includes(ctx.platform)) return false;
  if (scope.features && !scope.features.every(feature => ctx.features[feature] === true)) {
    return false;
  }
  return true;
};
