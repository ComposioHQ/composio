import type { Capability } from './capabilities';

/**
 * Delivery targets a skill can be built for.
 *
 * - `cli`: bundled for `@composio/cli`; version-pinned to a CLI release channel.
 * - `mcp`: MCP server artifact; not versioned today.
 */
export const PLATFORMS = ['cli', 'mcp'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Static map of which capabilities each platform can satisfy.
 *
 * Keep this conservative: only list a capability here once the platform
 * genuinely implements it end-to-end. The build fails fast when a skill
 * declares something not in this map for its target.
 */
export const PLATFORM_CAPABILITIES: Readonly<Record<Platform, ReadonlyArray<Capability>>> = {
  cli: ['listen', 'workbench', 'proxy', 'multi_account', 'subAgents'],
  mcp: ['workbench', 'proxy', 'multi_account'],
};

export const isCapabilitySupported = (platform: Platform, capability: Capability): boolean =>
  PLATFORM_CAPABILITIES[platform].includes(capability);

export const missingCapabilities = (
  platform: Platform,
  declared: readonly Capability[]
): Capability[] => declared.filter(capability => !isCapabilitySupported(platform, capability));
