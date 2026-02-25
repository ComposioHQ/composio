import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { clampLimit } from 'src/ui/clamp-limit';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { formatTriggerLogsTable } from '../format';
import { parseSearchParams, toSearchParam } from '../utils';

const cursor = Options.text('cursor').pipe(
  Options.withDescription('Cursor for pagination'),
  Options.optional
);

const entityId = Options.text('entity-id').pipe(
  Options.withDescription('Filter by user/entity id'),
  Options.optional
);

const integrationId = Options.text('integration-id').pipe(
  Options.withDescription('Filter by integration id'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDescription('Filter by user id'),
  Options.optional
);

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail,slack")'),
  Options.optional
);

const connectedAccounts = Options.text('connected-accounts').pipe(
  Options.withDescription('Filter by connected account ids, comma-separated'),
  Options.optional
);

const triggers = Options.text('triggers').pipe(
  Options.withDescription('Filter by trigger names, comma-separated'),
  Options.optional
);

const from = Options.integer('from').pipe(
  Options.withDescription('Start timestamp (epoch milliseconds)'),
  Options.optional
);

const to = Options.integer('to').pipe(
  Options.withDescription('End timestamp (epoch milliseconds)'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Number of logs to fetch (1-1000)')
);

const status = Options.choice('status', ['all', 'success', 'error'] as const).pipe(
  Options.optional,
  Options.withDescription('Filter by status')
);

const time = Options.choice('time', ['5m', '30m', '6h', '1d', '1w', '1month', '1y'] as const).pipe(
  Options.optional,
  Options.withDescription('Show logs from a relative time window')
);

const search = Options.text('search').pipe(
  Options.withDescription('Full-text search query'),
  Options.optional
);

const includePayload = Options.boolean('include-payload').pipe(
  Options.withDefault(false),
  Options.withDescription('Include payload fields in response')
);

const query = Options.text('query').pipe(
  Options.repeated,
  Options.withDescription('Advanced filter in "field:operation:value" format (repeatable)')
);

/**
 * List trigger logs with optional filters.
 *
 * @example
 * ```bash
 * composio logs triggers --status error --time 1d
 * composio logs triggers --entity-id user_123 --limit 20
 * composio logs triggers --toolkits gmail --triggers GMAIL_NEW_GMAIL_MESSAGE
 * composio logs triggers --connected-accounts con_123 --user-id user_123
 * composio logs triggers --query "meta.triggerName:eq:GMAIL_NEW_GMAIL_MESSAGE"
 * ```
 */
export const logsCmd$Triggers = Command.make(
  'triggers',
  {
    cursor,
    entityId,
    integrationId,
    userId,
    toolkits,
    connectedAccounts,
    triggers,
    from,
    to,
    limit,
    status,
    time,
    search,
    includePayload,
    query,
  },
  ({
    cursor,
    entityId,
    integrationId,
    userId,
    toolkits,
    connectedAccounts,
    triggers,
    from,
    to,
    limit,
    status,
    time,
    search,
    includePayload,
    query,
  }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      const clampedLimit = clampLimit(limit);
      const parsedSearchParams = parseSearchParams(query);
      const shorthandSearchParams = [
        ...(Option.isSome(toolkits)
          ? parseCsv(toolkits.value).map(value => toSearchParam('appName', value))
          : []),
        ...(Option.isSome(connectedAccounts)
          ? parseCsv(connectedAccounts.value).map(value => toSearchParam('connectionId', value))
          : []),
        ...(Option.isSome(triggers)
          ? parseCsv(triggers.value).map(value => toSearchParam('meta.triggerName', value))
          : []),
      ];
      const combinedSearchParams = [...shorthandSearchParams, ...parsedSearchParams];

      const response = yield* ui.withSpinner(
        'Fetching trigger logs...',
        Effect.tryPromise(() =>
          client.logs.triggers.list({
            cursor: Option.getOrUndefined(cursor),
            entityId: Option.getOrUndefined(entityId),
            integrationId: Option.getOrUndefined(integrationId),
            userId: Option.getOrUndefined(userId),
            from: Option.getOrUndefined(from),
            to: Option.getOrUndefined(to),
            limit: clampedLimit,
            status: Option.getOrUndefined(status),
            time: Option.getOrUndefined(time),
            search: Option.getOrUndefined(search),
            include_payload: includePayload,
            search_params: combinedSearchParams.length > 0 ? combinedSearchParams : undefined,
          })
        )
      );

      const logs = response.data ?? [];

      if (logs.length === 0) {
        yield* ui.log.warn('No trigger logs found for the given filters.');
        yield* ui.output(JSON.stringify(response, null, 2));
        return;
      }

      yield* ui.log.info(
        `Listing ${logs.length} trigger log${logs.length === 1 ? '' : 's'}\n\n${formatTriggerLogsTable(logs)}`
      );

      if (response.nextCursor) {
        yield* ui.log.step(`Next cursor: ${response.nextCursor}`);
      }

      yield* ui.output(JSON.stringify(response, null, 2));
    })
).pipe(Command.withDescription('List trigger logs.'));
