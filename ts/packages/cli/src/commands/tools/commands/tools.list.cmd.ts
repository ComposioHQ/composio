import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatToolsTable, formatToolsJson } from '../format';

const query = Options.text('query').pipe(
  Options.withDescription('Text search by name, slug, or description'),
  Options.optional
);

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription(
    'Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'
  ),
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
 * List available tools with optional filters.
 *
 * @example
 * ```bash
 * composio manage tools list --toolkits "gmail"
 * composio manage tools list --query "send email" --toolkits "gmail"
 * composio manage tools list --tags "important" --limit 10
 * ```
 */
export const toolsCmd$List = Command.make(
  'list',
  { query, toolkits, tags, limit },
  ({ query, toolkits, tags, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      const clampedLimit = clampLimit(limit);

      const result = yield* ui.withSpinner(
        'Fetching tools...',
        repo.searchTools({
          search: Option.getOrUndefined(query),
          toolkit_slug: Option.getOrUndefined(toolkits),
          tags: Option.getOrUndefined(tags),
          limit: clampedLimit,
        })
      );

      if (result.items.length === 0) {
        const hint = Option.isSome(toolkits)
          ? `No tools found in toolkit "${toolkits.value}". Verify the toolkit slug with:\n> composio manage toolkits list`
          : 'No tools found. Try broadening your search.';
        yield* ui.log.warn(hint);
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
        yield* ui.log.step(
          `To view details of a tool:\n> composio manage tools info "${firstSlug}"`
        );
      }

      yield* ui.output(formatToolsJson(result.items));
    })
).pipe(Command.withDescription('List available tools.'));
