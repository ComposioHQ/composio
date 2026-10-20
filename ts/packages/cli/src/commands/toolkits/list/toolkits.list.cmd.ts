import { Command, Flag } from 'effect/cli';
import { runToolkitsList } from './toolkits.list.handler';

const query = Flag.String('query').pipe(
  Flag.withDescription('Text search by name, slug, or description'),
  Flag.optional
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of results per page (1-1000)')
);

const connected = Flag.Boolean('connected').pipe(
  Flag.withDescription('Filter to connected toolkits only'),
  Flag.optional
);

/**
 * List available toolkits with connection status.
 *
 * @example
 * ```bash
 * composio dev toolkits list
 * composio dev toolkits list --query "email"
 * composio dev toolkits list --connected
 * composio dev toolkits list --user-id "alice"
 * ```
 */
export const toolkitsCmd$List = Command.make(
  'list',
  { query, limit, connected },
  runToolkitsList
).pipe(
  Command.withDescription('List available toolkits with connection status.'),
  Command.withExamples([{ command: 'composio dev toolkits list' }])
);
