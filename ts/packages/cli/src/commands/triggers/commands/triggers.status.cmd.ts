import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { requireAuth } from 'src/effects/require-auth';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import {
  formatTriggersStatusJson,
  formatTriggersStatusTable,
  toolkitSlugFromTriggerName,
} from '../format';
import { parseCsv } from '../parse-csv';

const userIds = Options.text('user-ids').pipe(
  Options.withDescription('Filter by user IDs, comma-separated'),
  Options.optional
);

const connectedAccountIds = Options.text('connected-account-ids').pipe(
  Options.withDescription('Filter by connected account IDs, comma-separated'),
  Options.optional
);

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription(
    'Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'
  ),
  Options.optional
);

const triggerIds = Options.text('trigger-ids').pipe(
  Options.withDescription('Filter by trigger instance IDs, comma-separated'),
  Options.optional
);

const triggerNames = Options.text('trigger-names').pipe(
  Options.withDescription(
    'Filter by trigger names, comma-separated (case-insensitive; normalized to uppercase)'
  ),
  Options.optional
);

const showDisabled = Options.boolean('show-disabled').pipe(
  Options.withDefault(false),
  Options.withDescription('Include disabled triggers in the response')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Number of results per page (1-1000)')
);

const csvOption = (opt: Option.Option<string>): string[] | undefined =>
  Option.isSome(opt) ? parseCsv(opt.value) : undefined;

/**
 * Display active trigger instances with optional filters.
 */
export const triggersCmd$Status = Command.make(
  'status',
  {
    userIds,
    connectedAccountIds,
    toolkits,
    triggerIds,
    triggerNames,
    showDisabled,
    limit,
  },
  ({ userIds, connectedAccountIds, toolkits, triggerIds, triggerNames, showDisabled, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      const connectedAccountIdsList = csvOption(connectedAccountIds);
      const triggerNamesList = csvOption(triggerNames)?.map(name => name.toUpperCase());
      const toolkitsList = csvOption(toolkits)?.map(slug => slug.toLowerCase());

      const resultOpt = yield* ui
        .withSpinner(
          'Fetching trigger status...',
          repo.listActiveTriggers({
            user_ids: csvOption(userIds),
            connected_account_ids: connectedAccountIdsList,
            trigger_ids: csvOption(triggerIds),
            trigger_names: triggerNamesList,
            show_disabled: showDisabled,
            limit: clampLimit(limit),
          })
        )
        .pipe(
          Effect.asSome,
          Effect.catchTag(
            'services/HttpServerError',
            handleHttpServerError(ui, {
              fallbackMessage: 'Failed to fetch trigger status.',
              hint: 'Retry with:\n> composio manage triggers status --show-disabled',
              fallbackValue: Option.none(),
            })
          )
        );

      if (Option.isNone(resultOpt)) {
        return;
      }

      const result = resultOpt.value;

      const filteredItems =
        toolkitsList && toolkitsList.length > 0
          ? result.items.filter(item =>
              toolkitsList.includes(toolkitSlugFromTriggerName(item.trigger_name))
            )
          : result.items;

      if (filteredItems.length === 0) {
        yield* ui.log.warn(
          showDisabled
            ? 'No triggers found for the provided filters.'
            : 'No active triggers found for the provided filters.'
        );
        return;
      }

      const showing = filteredItems.length;
      const total =
        toolkitsList && toolkitsList.length > 0 ? result.items.length : result.total_items;

      yield* ui.log.info(
        `Listing ${showing} of ${total} triggers\n\n${formatTriggersStatusTable(filteredItems)}`
      );
      yield* ui.output(formatTriggersStatusJson(filteredItems));
    })
).pipe(Command.withDescription('Show active triggers with optional filters.'));
