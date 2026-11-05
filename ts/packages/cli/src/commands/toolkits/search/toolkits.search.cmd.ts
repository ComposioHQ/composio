import { Argument, Command, Flag } from 'effect/cli';
import { runToolkitsSearch } from './toolkits.search.handler';

const query = Argument.String('query').pipe(
  Argument.withDescription('Search query (e.g. "send emails")')
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(10),
  Flag.withDescription('Number of results per page (1-1000)')
);

/**
 * Search toolkits by use case.
 *
 * @example
 * ```bash
 * composio dev toolkits search "send emails"
 * composio dev toolkits search "messaging" --limit 5
 * ```
 */
export const toolkitsCmd$Search = Command.make('search', { query, limit }, runToolkitsSearch).pipe(
  Command.withDescription('Search toolkits by use case.')
);
