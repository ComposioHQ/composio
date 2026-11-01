import { Effect } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { printFailure, ReportedFailure } from 'src/effects/report-failure';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { extractMessage } from 'src/utils/api-error-extraction';
import { formatToolkitsJson, formatToolkitsTable, mergeToolkitData } from '../format';

export type ToolkitsSearchParams = {
  readonly query: string;
  readonly limit: number;
};

// TODO(tool-router-migration): migrate to Tool Router when the session toolkits endpoint
// supports text search. Currently SessionToolsParams has no search capability.

/**
 * Searches the toolkit catalog by use case. A failed search prints the error, writes `[]` to
 * stdout, and exits 1.
 */
export const runToolkitsSearch = ({ query, limit }: ToolkitsSearchParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const result = yield* ui.withSpinner(
      `Searching toolkits for "${query}"...`,
      repo.searchToolkits({ search: query, limit: clampLimit(limit) })
    );

    if (result.items.length === 0) {
      yield* ui.log.warn(`No toolkits found matching "${query}". Try broadening your search.`);
      yield* ui.output('[]');
      return;
    }

    const rows = mergeToolkitData(result.items);

    yield* ui.log.info(
      `Found ${result.items.length} of ${result.total_items} toolkits\n\n${formatToolkitsTable(rows)}`
    );

    const firstSlug = rows[0]?.slug;
    if (firstSlug) {
      yield* ui.log.step(`To view details:\n> composio dev toolkits info "${firstSlug}"`);
    }

    yield* ui.output(formatToolkitsJson(rows));
  }).pipe(
    Effect.catch(error =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const message = extractMessage(error) ?? 'An error occurred while searching toolkits.';
        yield* printFailure(ui, message);
        yield* ui.output('[]');
        return yield* new ReportedFailure({ message });
      })
    )
  );
