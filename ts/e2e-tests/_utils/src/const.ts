import toolchainVersions from '../../../../toolchain-versions.json' with { type: 'json' };

/**
 * Environment variables to automatically pass through to Docker containers.
 */
export const WELL_KNOWN_ENV_VARS = [
  'COMPOSIO_API_KEY',
  'COMPOSIO_BASE_URL',
  'OPENAI_API_KEY',
] as const;

/**
 * Node.js versions that are well-known to the CI matrix strategy.
 * `current` refers to the Node.js version specified in mise.toml.
 */
export const WELL_KNOWN_NODE_VERSIONS = [...toolchainVersions.node, 'current'] as const;

/**
 * Deno versions that are well-known to the CI matrix strategy.
 * `current` refers to the Deno version specified in mise.toml.
 */
export const WELL_KNOWN_DENO_VERSIONS = [...toolchainVersions.deno, 'current'] as const;

/**
 * CLI versions that are well-known to the CI strategy.
 * `current` refers to the version in ts/packages/cli/package.json.
 */
export const WELL_KNOWN_CLI_VERSIONS = ['current'] as const;

export const TIMEOUTS = {
  DEFAULT: 5_000,
  FIXTURE: 120_000,
  LLM_SHORT: 30_000,
  LLM_LONG: 60_000,
} as const;
