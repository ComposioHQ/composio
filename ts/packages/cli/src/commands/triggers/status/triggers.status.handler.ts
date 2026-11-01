import { Array as Arr, Effect, Option } from 'effect';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import {
  ComposioToolkitsRepository,
  type ComposioToolkitsRepositoryShape,
} from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import {
  formatTriggersStatusJson,
  formatTriggersStatusTable,
  toolkitSlugFromTriggerName,
} from '../format';
import { parseCsv } from '../parse-csv';

export type TriggersStatusParams = {
  readonly userIds: Option.Option<string>;
  readonly connectedAccountIds: Option.Option<string>;
  readonly toolkits: Option.Option<string>;
  readonly triggerIds: Option.Option<string>;
  readonly triggerNames: Option.Option<string>;
  readonly showDisabled: boolean;
  readonly limit: number;
};

type ActiveTriggersPage = Effect.Success<
  ReturnType<ComposioToolkitsRepositoryShape['listActiveTriggers']>
>;

/** The comma-separated values of a filter flag, or `undefined` when the flag is absent. */
const csvOption = (opt: Option.Option<string>): string[] | undefined =>
  Option.getOrUndefined(Option.map(opt, parseCsv));

/**
 * The page's triggers whose toolkit is in `toolkits`, and the total the listing reports:
 * the API's count without a toolkit filter, the size of the page with one, since the API
 * does not filter by toolkit.
 */
const filterByToolkits = (
  page: ActiveTriggersPage,
  toolkits: Option.Option<Arr.NonEmptyReadonlyArray<string>>
) =>
  Option.match(toolkits, {
    onNone: () => ({ items: page.items, total: page.total_items }),
    onSome: slugs => ({
      items: page.items.filter(item =>
        slugs.includes(toolkitSlugFromTriggerName(item.trigger_name))
      ),
      total: page.items.length,
    }),
  });

/**
 * Display active trigger instances with optional filters.
 *
 * @example
 * ```bash
 * composio dev triggers status
 * composio dev triggers status --toolkits gmail,slack --show-disabled
 * ```
 */
export const runTriggersStatus = ({
  userIds,
  connectedAccountIds,
  toolkits,
  triggerIds,
  triggerNames,
  showDisabled,
  limit,
}: TriggersStatusParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // An empty list (`--toolkits ","`) filters nothing.
    const toolkitFilter = Option.flatMap(toolkits, csv =>
      Arr.match(parseCsv(csv), {
        onEmpty: () => Option.none<Arr.NonEmptyReadonlyArray<string>>(),
        onNonEmpty: slugs => Option.some(Arr.map(slugs, slug => slug.toLowerCase())),
      })
    );

    const page = yield* ui
      .withSpinner(
        'Fetching trigger status...',
        repo.listActiveTriggers({
          user_ids: csvOption(userIds),
          connected_account_ids: csvOption(connectedAccountIds),
          trigger_ids: csvOption(triggerIds),
          trigger_names: csvOption(triggerNames)?.map(name => name.toUpperCase()),
          show_disabled: showDisabled,
          limit: clampLimit(limit),
        })
      )
      .pipe(
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: 'Failed to fetch trigger status.',
            hint: 'Retry with:\n> composio dev triggers status --show-disabled',
          })
        )
      );

    const { items, total } = filterByToolkits(page, toolkitFilter);
    yield* Arr.match(items, {
      onEmpty: () =>
        ui.log.warn(
          showDisabled
            ? 'No triggers found for the provided filters.'
            : 'No active triggers found for the provided filters.'
        ),
      onNonEmpty: shown =>
        Effect.gen(function* () {
          yield* ui.log.info(
            `Listing ${shown.length} of ${total} triggers\n\n${formatTriggersStatusTable(shown)}`
          );
          yield* ui.output(formatTriggersStatusJson(shown));
        }),
    });
  });
