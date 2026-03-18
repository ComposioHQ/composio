import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { extractMessage } from 'src/utils/api-error-extraction';
import { mergeToolkitData, formatToolkitsTable, formatToolkitsJson } from '../format';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription('Search query (e.g. "send emails")')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription('Number of results per page (1-1000)')
);

// TODO(tool-router-migration): migrate to Tool Router when the session toolkits endpoint
// supports text search. Currently SessionToolsParams has no search capability.

/**
 * Search toolkits by use case.
 *
 * @example
 * ```bash
 * composio manage toolkits search "send emails"
 * composio manage toolkits search "messaging" --limit 5
 * ```
 */
export const toolkitsCmd$Search = Command.make('search', { query, limit }, ({ query, limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const clampedLimit = clampLimit(limit);

    const result = yield* ui.withSpinner(
      `Searching toolkits for "${query}"...`,
      repo.searchToolkits({ search: query, limit: clampedLimit })
    );

    if (result.items.length === 0) {
      yield* ui.log.warn(`No toolkits found matching "${query}". Try broadening your search.`);
      yield* ui.output('[]');
      return;
    }

    const showing = result.items.length;
    const total = result.total_items;

    const unified = mergeToolkitData(result.items);

    yield* ui.log.info(`Found ${showing} of ${total} toolkits\n\n${formatToolkitsTable(unified)}`);

    // Next step hint
    const firstSlug = unified[0]?.slug;
    if (firstSlug) {
      yield* ui.log.step(`To view details:\n> composio manage toolkits info "${firstSlug}"`);
    }

    yield* ui.output(formatToolkitsJson(unified));
  }).pipe(
    Effect.catchAll(error =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        yield* ui.log.error(extractMessage(error) ?? 'An error occurred while searching toolkits.');
        yield* ui.output('[]');
        process.exitCode = 1;
      })
    )
  )
).pipe(Command.withDescription('Search toolkits by use case.'));
