import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { formatAuthConfigsTable, formatAuthConfigsJson } from '../format';

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription(
    'Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'
  ),
  Options.optional
);

const query = Options.text('query').pipe(
  Options.withDescription('Search by auth config name'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Number of results per page (1-1000)')
);

/**
 * List auth configs with optional filters.
 *
 * @example
 * ```bash
 * composio auth-configs list
 * composio auth-configs list --toolkits "gmail"
 * composio auth-configs list --query "my config" --limit 10
 * ```
 */
export const authConfigsCmd$List = Command.make(
  'list',
  { toolkits, query, limit },
  ({ toolkits, query, limit }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      const repo = yield* ComposioToolkitsRepository;

      // Auth guard
      if (Option.isNone(ctx.data.apiKey)) {
        yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
        return;
      }

      const clampedLimit = Math.max(1, Math.min(1000, limit));

      const result = yield* ui.withSpinner(
        'Fetching auth configs...',
        repo.listAuthConfigs({
          search: Option.getOrUndefined(query),
          toolkit_slug: Option.getOrUndefined(toolkits),
          limit: clampedLimit,
        })
      );

      if (result.items.length === 0) {
        const hint = Option.isSome(toolkits)
          ? `No auth configs found for toolkit "${toolkits.value}". Verify the toolkit slug with:\n> composio toolkits list`
          : 'No auth configs found. Try broadening your search.';
        yield* ui.log.warn(hint);
        return;
      }

      const showing = result.items.length;
      const total = result.total_items;

      yield* ui.log.info(
        `Listing ${showing} of ${total} auth configs\n\n${formatAuthConfigsTable(result.items)}`
      );

      // Next step hint
      const firstId = result.items[0]?.id;
      if (firstId) {
        yield* ui.log.step(
          `To view details of an auth config:\n> composio auth-configs info "${firstId}"`
        );
      }

      yield* ui.output(formatAuthConfigsJson(result.items));
    })
).pipe(Command.withDescription('List auth configs.'));
