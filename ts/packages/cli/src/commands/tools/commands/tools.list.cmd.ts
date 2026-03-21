import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatToolsTable, formatToolsJson } from '../format';

const toolkit = Args.text({ name: 'toolkit' }).pipe(
  Args.withDescription('Toolkit slug to list tools for (e.g. "gmail")')
);

const query = Options.text('query').pipe(
  Options.withDescription('Text search by name, slug, or description'),
  Options.optional
);

const tags = Options.text('tags').pipe(
  Options.withDescription('Filter by tags (e.g. "important")'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Number of results per page (1-1000)')
);

/**
 * List available tools for a toolkit with optional filters.
 *
 * @example
 * ```bash
 * composio tools list gmail
 * composio tools list gmail --query "send email"
 * composio tools list gmail --tags "important" --limit 10
 * ```
 */
export const toolsCmd$List = Command.make(
  'list',
  { toolkit, query, tags, limit },
  ({ toolkit, query, tags, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      const clampedLimit = clampLimit(limit);

      const result = yield* ui.withSpinner(
        'Fetching tools...',
        repo.searchTools({
          search: Option.getOrUndefined(query),
          toolkit_slug: toolkit,
          tags: Option.getOrUndefined(tags),
          limit: clampedLimit,
        })
      );

      if (result.items.length === 0) {
        yield* ui.log.warn(
          `No tools found in toolkit "${toolkit}". Verify the toolkit slug with:\n> composio manage toolkits list`
        );
        return;
      }

      const showing = result.items.length;
      const totalPages = result.total_pages;

      yield* ui.log.info(
        totalPages > 1
          ? `Listing ${showing} tools (page 1 of ${totalPages})\n\n${formatToolsTable(result.items)}`
          : `Listing ${showing} tools\n\n${formatToolsTable(result.items)}`
      );

      // Next step hint
      const firstSlug = result.items[0]?.slug;
      if (firstSlug) {
        yield* ui.log.step(`To inspect a tool:\n> composio tools info "${firstSlug}"`);
      }

      yield* ui.output(formatToolsJson(result.items));
    })
).pipe(Command.withDescription('List available tools for a toolkit.'));
