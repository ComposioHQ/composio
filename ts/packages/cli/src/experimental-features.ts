/**
 * Map of experimental feature flags used to gate CLI commands and skill output.
 *
 * Extracted into its own module so that the skill build/validate scripts
 * (`skills-src/`) can import it without pulling in `@composio/core` (which
 * requires a prior build step).
 */
export const CLI_EXPERIMENTAL_FEATURES = {
  LISTEN: 'listen',
  MULTI_ACCOUNT: 'multi_account',
} as const;

export const CLI_RELEASE_CHANNELS = ['stable', 'beta'] as const;

export type CliReleaseChannel = (typeof CLI_RELEASE_CHANNELS)[number];
