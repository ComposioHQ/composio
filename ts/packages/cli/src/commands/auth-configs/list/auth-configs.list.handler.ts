import { Array as Arr, Effect, Option, String } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { redact } from 'src/ui/redact';
import { formatAuthConfigsJson, formatAuthConfigsTable } from './auth-configs.list.format';

export type AuthConfigsListParams = {
  readonly toolkits: Option.Option<string>;
  readonly query: Option.Option<string>;
  readonly limit: number;
};

/**
 * List auth configs, filtered by toolkit and name: the table on stderr, the JSON on stdout.
 */
export const runAuthConfigsList = ({ toolkits, query, limit }: AuthConfigsListParams) =>
  Effect.gen(function* () {
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
      const hint = Option.match(toolkits, {
        onNone: () => 'No auth configs found. Try broadening your search.',
        onSome: toolkit =>
          `No auth configs found for toolkit "${toolkit}". Verify the toolkit slug with:\n> composio dev toolkits list`,
      });
      yield* ui.log.warn(hint);
      return;
    }

    const showing = result.items.length;
    const total = result.total_items;

    yield* ui.log.info(
      `Listing ${showing} of ${total} auth configs\n\n${formatAuthConfigsTable(result.items)}`
    );

    const firstId = Arr.head(result.items).pipe(
      Option.map(item => item.id),
      Option.filter(String.isNonEmpty)
    );
    yield* Option.match(firstId, {
      onNone: () => Effect.void,
      onSome: id =>
        ui.log.step(
          `To view details of an auth config:\n> composio dev auth-configs info "${redact({ value: id, prefix: 'ac_' })}"`
        ),
    });

    yield* ui.output(formatAuthConfigsJson(result.items));
  });
