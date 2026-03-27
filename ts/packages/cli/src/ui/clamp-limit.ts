import { Effect } from 'effect';

export const CLI_LIMIT_MIN = 1;
export const CLI_LIMIT_MAX = 50;

export const formatLimitDescription = (subject: string): string =>
  `${subject} (${CLI_LIMIT_MIN}-${CLI_LIMIT_MAX})`;

export const formatInvalidLimitMessage = (limit: number): string =>
  `Invalid \`--limit\` value: ${limit}. Expected an integer between ${CLI_LIMIT_MIN} and ${CLI_LIMIT_MAX}.`;

export const validateLimit = (limit: number) =>
  limit >= CLI_LIMIT_MIN && limit <= CLI_LIMIT_MAX
    ? Effect.succeed(limit)
    : Effect.fail(new Error(formatInvalidLimitMessage(limit)));

/**
 * Clamp a user-provided limit to the valid API range [1, 50].
 *
 * Prefer `validateLimit` for CLI flag handling so invalid input fails fast.
 */
export const clampLimit = (n: number): number =>
  Math.max(CLI_LIMIT_MIN, Math.min(CLI_LIMIT_MAX, n));
