import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { redact } from 'src/ui/redact';
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
 * composio manage auth-configs list
 * composio manage auth-configs list --toolkits "gmail"
 * composio manage auth-configs list --query "my config" --limit 10
 * ```
 */
export const authConfigsCmd$List = Command.make(
  'list',
  { toolkits, query, limit },
  ({ toolkits, query, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      const result = yield* ui.withSpinner(
        'Fetching auth configs...',
        repo.listAuthConfigs({
          search: Option.getOrUndefined(query),
          toolkit_slug: Option.getOrUndefined(toolkits),
          limit: clampLimit(limit),
        })
      );

      if (result.items.length === 0) {
        const hint = Option.isSome(toolkits)
          ? `No auth configs found for toolkit "${toolkits.value}". Verify the toolkit slug with:\n> composio manage toolkits list`
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
      const redactedId = redact({ value: firstId, prefix: 'ac_' });

      if (firstId) {
        yield* ui.log.step(
          `To view details of an auth config:\n> composio manage auth-configs info "${redactedId}"`
        );
      }

      yield* ui.output(formatAuthConfigsJson(result.items));
    })
).pipe(Command.withDescription('List auth configs.'));
