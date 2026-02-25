import { Composio } from '@composio/client';
import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import type { Logs } from '@composio/client/resources/logs/logs';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { formatToolLogInfo, formatToolLogsTable } from '../format';
import { parseSearchParams, toSearchParam } from '../utils';

const cursor = Options.integer('cursor').pipe(
  Options.optional,
  Options.withDescription('Cursor for pagination')
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

const caseSensitive = Options.boolean('case-sensitive').pipe(
  Options.withDefault(false),
  Options.withDescription('Whether search params are case-sensitive')
);

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail,slack")'),
  Options.optional
);

const connectedAccounts = Options.text('connected-accounts').pipe(
  Options.withDescription('Filter by connected account ids, comma-separated'),
  Options.optional
);

const tools = Options.text('tools').pipe(
  Options.withDescription('Filter by tool slugs, comma-separated (e.g. "GMAIL_SEND_EMAIL")'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDescription('Filter by user id'),
  Options.optional
);

const query = Options.text('query').pipe(
  Options.repeated,
  Options.withDescription('Advanced filter in "field:operation:value" format (repeatable)')
);

const logId = Args.text({ name: 'log_id' }).pipe(
  Args.withDescription('Tool log ID'),
  Args.optional
);

/**
 * List tool execution logs with optional filters.
 *
 * @example
 * ```bash
 * composio logs tools --limit 50
 * composio logs tools <log_id>
 * composio logs tools --toolkits gmail --tools GMAIL_SEND_EMAIL
 * composio logs tools --connected-accounts con_123 --user-id user_123
 * composio logs tools --from 1735689600000 --to 1735776000000
 * composio logs tools --query "actionKey:eq:GMAIL_SEND_EMAIL"
 * ```
 */
export const logsCmd$Tools = Command.make(
  'tools',
  {
    logId,
    cursor,
    from,
    to,
    limit,
    caseSensitive,
    toolkits,
    connectedAccounts,
    tools,
    userId,
    query,
  },
  ({
    logId,
    cursor,
    from,
    to,
    limit,
    caseSensitive,
    toolkits,
    connectedAccounts,
    tools,
    userId,
    query,
  }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      const composio = new Composio({
        apiKey: Option.getOrUndefined(ctx.data.apiKey),
        baseURL: ctx.data.baseURL,
      });
      const logsClient = composio as unknown as {
        logs: {
          tools: {
            retrieve: (id: string) => Promise<Logs.ToolRetrieveResponse>;
            list: (body: Logs.ToolListParams) => Promise<Logs.ToolListResponse>;
          };
        };
      };
      const clampedLimit = clampLimit(limit);
      const parsedSearchParams = parseSearchParams(query);
      const shorthandSearchParams = [
        ...(Option.isSome(toolkits)
          ? parseCsv(toolkits.value).map(value => toSearchParam('appKey', value))
          : []),
        ...(Option.isSome(connectedAccounts)
          ? parseCsv(connectedAccounts.value).map(value =>
              toSearchParam('connectedAccountId', value)
            )
          : []),
        ...(Option.isSome(tools)
          ? parseCsv(tools.value).map(value => toSearchParam('actionKey', value))
          : []),
        ...(Option.isSome(userId) ? [toSearchParam('entityId', userId.value)] : []),
      ];
      const combinedSearchParams = [...shorthandSearchParams, ...parsedSearchParams];
      const toolLogId = Option.getOrUndefined(logId);

      if (toolLogId) {
        const toolLog = yield* ui.withSpinner(
          `Fetching tool log "${toolLogId}"...`,
          Effect.tryPromise({
            try: () => logsClient.logs.tools.retrieve(toolLogId),
            catch: error => new Error(String(error)),
          })
        );

        yield* ui.log.info(
          `${formatToolLogInfo(toolLog)}\n\nPayload:\n${JSON.stringify(toolLog.payloadReceived, null, 2)}\n\nResponse:\n${JSON.stringify(toolLog.response, null, 2)}`
        );
        yield* ui.output(JSON.stringify(toolLog, null, 2));
        return;
      }

      const response = yield* ui.withSpinner(
        'Fetching tool logs...',
        Effect.tryPromise({
          try: () =>
            logsClient.logs.tools.list({
              cursor: Option.getOrUndefined(cursor) ?? null,
              from: Option.getOrUndefined(from),
              to: Option.getOrUndefined(to),
              limit: clampedLimit,
              case_sensitive: caseSensitive,
              search_params: combinedSearchParams.length > 0 ? combinedSearchParams : undefined,
            }),
          catch: error => new Error(String(error)),
        })
      );

      const logs = response.data ?? [];

      if (logs.length === 0) {
        yield* ui.log.warn('No tool logs found for the given filters.');
        yield* ui.output(JSON.stringify(response, null, 2));
        return;
      }

      yield* ui.log.info(
        `Listing ${logs.length} tool log${logs.length === 1 ? '' : 's'}\n\n${formatToolLogsTable(logs)}`
      );

      const firstLogId = logs[0]?.id;
      if (firstLogId) {
        yield* ui.log.step(
          `To view full details for a log:\n> composio logs tools "${firstLogId}"`
        );
      }

      if (response.nextCursor !== null && response.nextCursor !== undefined) {
        yield* ui.log.step(`Next cursor: ${response.nextCursor}`);
      }

      yield* ui.output(JSON.stringify(response, null, 2));
    })
).pipe(
  Command.withDescription('List tool execution logs, or pass a log_id to fetch a specific log.')
);
