import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatToolkitsTable, formatToolkitsJson } from '../format';

const query = Options.text('query').pipe(
  Options.withDescription('Text search by name, slug, or description'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Number of results per page (1-1000)')
);

/**
 * List available toolkits with optional filters.
 *
 * @example
 * ```bash
 * composio toolkits list
 * composio toolkits list --query "email"
 * composio toolkits list --category "messaging" --limit 10
 * ```
 */
export const toolkitsCmd$List = Command.make('list', { query, limit }, ({ query, limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const clampedLimit = clampLimit(limit);

    const result = yield* ui.withSpinner(
      'Fetching toolkits...',
      repo.searchToolkits({
        search: Option.getOrUndefined(query),
        limit: clampedLimit,
      })
    );

    if (result.items.length === 0) {
      yield* ui.log.warn('No toolkits found. Try broadening your search.');
      return;
    }

    const showing = result.items.length;
    const total = result.total_items;

    yield* ui.log.info(
      `Listing ${showing} of ${total} toolkits\n\n${formatToolkitsTable(result.items)}`
    );

    // Next step hint
    const firstSlug = result.items[0]?.slug;
    if (firstSlug) {
      yield* ui.log.step(`To view details of a toolkit:\n> composio toolkits info "${firstSlug}"`);
    }

    yield* ui.output(formatToolkitsJson(result.items));
  })
).pipe(Command.withDescription('List available toolkits.'));
