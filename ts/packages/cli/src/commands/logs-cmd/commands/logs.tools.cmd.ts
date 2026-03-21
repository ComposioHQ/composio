import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { clampLimit } from 'src/ui/clamp-limit';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { formatToolLogInfo, formatToolLogsTable } from '../format';
import { commandHintStep } from 'src/services/command-hints';
import { toSearchParam } from '../utils';

type ToolLogFilterInput = {
  tool?: string;
  toolkit?: string;
  connectedAccountId?: string;
  authConfigId?: string;
  status?: string;
  userId?: string;
  logId?: string;
  toolRouterSessionId?: string;
  sessionId?: string;
};

const toSearchParams = (value: string | undefined, field: string) =>
  value === undefined ? [] : parseCsv(value).map(item => toSearchParam(field, item));

export const buildToolLogShorthandSearchParams = (
  filters: ToolLogFilterInput
): Array<ReturnType<typeof toSearchParam>> => [
  ...toSearchParams(filters.tool, 'action_key'),
  ...toSearchParams(filters.toolkit, 'toolkit_key'),
  ...toSearchParams(filters.connectedAccountId, 'connected_account_id'),
  ...toSearchParams(filters.authConfigId, 'auth_config_id'),
  ...toSearchParams(filters.status, 'execution_status'),
  ...toSearchParams(filters.userId, 'user_id'),
  ...toSearchParams(filters.logId, 'log_id'),
  ...toSearchParams(filters.toolRouterSessionId, 'tool_router_session_id'),
  ...toSearchParams(filters.sessionId, 'session_id'),
];

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

const toolkit = Options.text('toolkit').pipe(
  Options.withDescription('Filter by toolkit key(s), comma-separated (e.g. "gmail,slack")'),
  Options.optional
);

const tool = Options.text('tool').pipe(
  Options.withDescription('Filter by tool key(s), comma-separated (e.g. "GMAIL_SEND_EMAIL")'),
  Options.optional
);

const connectedAccountId = Options.text('connected-account-id').pipe(
  Options.withDescription('Filter by connected account id(s), comma-separated'),
  Options.optional
);

const authConfigId = Options.text('auth-config-id').pipe(
  Options.withDescription('Filter by auth config id(s), comma-separated'),
  Options.optional
);

const status = Options.text('status').pipe(
  Options.withDescription('Filter by execution status value(s), comma-separated'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDescription('Filter by user id(s), comma-separated'),
  Options.optional
);

const logIdFilter = Options.text('log-id').pipe(
  Options.withDescription('Filter by log id(s), comma-separated'),
  Options.optional
);

const toolRouterSessionId = Options.text('tool-router-session-id').pipe(
  Options.withDescription('Filter by tool router session id(s), comma-separated'),
  Options.optional
);

const sessionId = Options.text('session-id').pipe(
  Options.withDescription('Filter by session id(s), comma-separated'),
  Options.optional
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
 * composio manage logs tools --limit 50
 * composio manage logs tools <log_id>
 * composio manage logs tools --toolkit gmail --tool GMAIL_SEND_EMAIL
 * composio manage logs tools --connected-account-id con_123 --user-id user_123
 * composio manage logs tools --status success --auth-config-id ac_123
 * composio manage logs tools --from 1735689600000 --to 1735776000000
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
    toolkit,
    tool,
    connectedAccountId,
    authConfigId,
    status,
    userId,
    logIdFilter,
    toolRouterSessionId,
    sessionId,
  },
  ({
    logId,
    cursor,
    from,
    to,
    limit,
    caseSensitive,
    toolkit,
    tool,
    connectedAccountId,
    authConfigId,
    status,
    userId,
    logIdFilter,
    toolRouterSessionId,
    sessionId,
  }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      const clampedLimit = clampLimit(limit);
      const shorthandSearchParams = buildToolLogShorthandSearchParams({
        tool: Option.getOrUndefined(tool),
        toolkit: Option.getOrUndefined(toolkit),
        connectedAccountId: Option.getOrUndefined(connectedAccountId),
        authConfigId: Option.getOrUndefined(authConfigId),
        status: Option.getOrUndefined(status),
        userId: Option.getOrUndefined(userId),
        logId: Option.getOrUndefined(logIdFilter),
        toolRouterSessionId: Option.getOrUndefined(toolRouterSessionId),
        sessionId: Option.getOrUndefined(sessionId),
      });
      const toolLogId = Option.getOrUndefined(logId);

      if (toolLogId) {
        const toolLog = yield* ui.withSpinner(
          `Fetching tool log "${toolLogId}"...`,
          Effect.tryPromise(() => client.logs.tools.retrieve(toolLogId))
        );

        yield* ui.log.info(
          `${formatToolLogInfo(toolLog)}\n\nPayload:\n${JSON.stringify(toolLog.payloadReceived, null, 2)}\n\nResponse:\n${JSON.stringify(toolLog.response, null, 2)}`
        );
        yield* ui.output(JSON.stringify(toolLog, null, 2));
        return;
      }

      const response = yield* ui.withSpinner(
        'Fetching tool logs...',
        Effect.tryPromise(() =>
          client.logs.tools.list({
            cursor: Option.getOrUndefined(cursor) ?? null,
            from: Option.getOrUndefined(from),
            to: Option.getOrUndefined(to),
            limit: clampedLimit,
            case_sensitive: caseSensitive,
            search_params: shorthandSearchParams.length > 0 ? shorthandSearchParams : undefined,
          })
        )
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
          commandHintStep('To view full details for a log', 'dev.logs.tools', {
            logId: firstLogId,
          })
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
