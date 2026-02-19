import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatToolsTable, formatToolsJson } from '../format';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription('Search query (e.g. "send emails")')
);

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail,outlook")'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription('Number of results per page (1-1000)')
);

/**
 * Search tools by use case.
 *
 * @example
 * ```bash
 * composio tools search "send emails"
 * composio tools search "send emails" --toolkits "gmail,outlook"
 * composio tools search "messaging" --limit 5
 * ```
 */
export const toolsCmd$Search = Command.make(
  'search',
  { query, toolkits, limit },
  ({ query, toolkits, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      const clampedLimit = clampLimit(limit);

      const result = yield* ui.withSpinner(
        `Searching tools for "${query}"...`,
        repo.searchTools({
          search: query,
          toolkit_slug: Option.getOrUndefined(toolkits),
          limit: clampedLimit,
        })
      );

      if (result.items.length === 0) {
        yield* ui.log.warn(`No tools found matching "${query}". Try broadening your search.`);
        return;
      }

      yield* ui.log.info(`Found ${result.items.length} tools\n\n${formatToolsTable(result.items)}`);

      // Next step hint
      const firstSlug = result.items[0]?.slug;
      if (firstSlug) {
        yield* ui.log.step(`To view details:\n> composio tools info "${firstSlug}"`);
      }

      yield* ui.output(formatToolsJson(result.items));
    })
).pipe(Command.withDescription('Search tools by use case.'));
