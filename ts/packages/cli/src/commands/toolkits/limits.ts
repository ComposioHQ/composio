import { Effect } from 'effect';

export const TOOLKITS_LIMIT_MIN = 1;
export const TOOLKITS_LIMIT_MAX = 50;

export const TOOLKITS_LIMIT_DESCRIPTION = `Number of results per page (${TOOLKITS_LIMIT_MIN}-${TOOLKITS_LIMIT_MAX})`;

export const formatInvalidToolkitsLimitMessage = (limit: number): string =>
  `Invalid \`--limit\` value: ${limit}. Expected an integer between ${TOOLKITS_LIMIT_MIN} and ${TOOLKITS_LIMIT_MAX}.`;

export const validateToolkitsLimit = (limit: number) =>
  limit >= TOOLKITS_LIMIT_MIN && limit <= TOOLKITS_LIMIT_MAX
    ? Effect.succeed(limit)
    : Effect.fail(new Error(formatInvalidToolkitsLimitMessage(limit)));
