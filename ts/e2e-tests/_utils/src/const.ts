/**
 * Environment variables to automatically pass through to Docker containers.
 */
export const WELL_KNOWN_ENV_VARS = ['COMPOSIO_API_KEY', 'OPENAI_API_KEY'] as const;

/**
 * Node.js versions that are well-known to the CI matrix strategy.
 * `current` refers to the Node.js version specified in `.nvmrc`.
 */
export const WELL_KNOWN_NODE_VERSIONS = ['20.18.0', '20.19.0', '22.12.0', 'current'] as const;

/**
 * Deno versions that are well-known to the CI matrix strategy.
 * `current` refers to the Deno version specified in `.dvmrc`.
 */
export const WELL_KNOWN_DENO_VERSIONS = ['2.6.7', 'current'] as const;

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
