import { Command, Flag } from 'effect/cli';
import { runAuthConfigsList } from './auth-configs.list.handler';

const toolkits = Flag.String('toolkits').pipe(
  Flag.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'),
  Flag.optional
);

const query = Flag.String('query').pipe(
  Flag.withDescription('Search by auth config name'),
  Flag.optional
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of results per page (1-1000)')
);

/**
 * List auth configs with optional filters.
 *
 * @example
 * ```bash
 * composio dev auth-configs list
 * composio dev auth-configs list --toolkits "gmail"
 * composio dev auth-configs list --query "my config" --limit 10
 * ```
 */
export const authConfigsCmd$List = Command.make(
  'list',
  { toolkits, query, limit },
  runAuthConfigsList
).pipe(Command.withDescription('List auth configs.'));
