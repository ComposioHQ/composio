import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import type { Toolkit, ToolkitSearchResult } from 'src/models/toolkits';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { extractMessage } from 'src/utils/api-error-extraction';
import { mergeToolkitData, formatToolkitsTable, formatToolkitsJson } from '../format';
import { TOOLKITS_LIMIT_DESCRIPTION, validateToolkitsLimit } from '../limits';

const query = Args.text({ name: 'query' }).pipe(
  Args.withDescription('Search query (e.g. "send emails")')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(10),
  Options.withDescription(TOOLKITS_LIMIT_DESCRIPTION)
);

const filterToolkitsForSearchQuery = (
  toolkits: ReadonlyArray<Toolkit>,
  query: string
): ReadonlyArray<Toolkit> => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return toolkits;

  const rankMatch = (value: string) => {
    const normalizedValue = value.toLowerCase();
    if (normalizedValue === normalizedQuery) return 0;
    if (normalizedValue.startsWith(normalizedQuery)) return 1;

    const words = normalizedValue.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some(word => word === normalizedQuery)) return 2;
    if (words.some(word => word.startsWith(normalizedQuery))) return 3;
    if (normalizedValue.includes(normalizedQuery)) return 4;

    return undefined;
  };

  return toolkits
    .map(toolkit => {
      const slugRank = rankMatch(toolkit.slug);
      const nameRank = rankMatch(toolkit.name);
      const descriptionRank = rankMatch(toolkit.meta.description);

      const bestRank = [slugRank, nameRank, descriptionRank].reduce<number | undefined>(
        (currentBest, candidate) => {
          if (candidate === undefined) return currentBest;
          if (currentBest === undefined) return candidate;
          return Math.min(currentBest, candidate);
        },
        undefined
      );

      return bestRank === undefined ? undefined : { toolkit, bestRank };
    })
    .filter((value): value is { toolkit: Toolkit; bestRank: number } => value !== undefined)
    .sort((left, right) => {
      if (left.bestRank !== right.bestRank) return left.bestRank - right.bestRank;
      return left.toolkit.slug.localeCompare(right.toolkit.slug);
    })
    .map(({ toolkit }) => toolkit);
};

const buildCatalogResultFromToolkits = (
  toolkits: ReadonlyArray<Toolkit>,
  limit: number
): ToolkitSearchResult => ({
  items: toolkits.slice(0, limit),
  total_items: toolkits.length,
  total_pages: toolkits.length === 0 ? 0 : Math.ceil(toolkits.length / limit),
  next_cursor: null,
});

const searchToolkitsFromCatalog = (
  repo: ComposioToolkitsRepository,
  query: string,
  limit: number
) =>
  repo.getToolkits().pipe(
    Effect.map(toolkits => filterToolkitsForSearchQuery(toolkits, query)),
    Effect.map(toolkits => buildCatalogResultFromToolkits(toolkits, limit))
  );

// TODO(tool-router-migration): migrate to Tool Router when the session toolkits endpoint
// supports text search. Currently SessionToolsParams has no search capability.

/**
 * Search toolkits by use case.
 *
 * @example
 * ```bash
 * composio dev toolkits search "send emails"
 * composio dev toolkits search "messaging" --limit 5
 * ```
 */
export const toolkitsCmd$Search = Command.make('search', { query, limit }, ({ query, limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const validatedLimit = yield* validateToolkitsLimit(limit);

    const result = yield* ui.withSpinner(
      `Searching toolkits for "${query}"...`,
      searchToolkitsFromCatalog(repo, query, validatedLimit)
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
      yield* ui.log.step(`To view details:\n> composio dev toolkits info "${firstSlug}"`);
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
