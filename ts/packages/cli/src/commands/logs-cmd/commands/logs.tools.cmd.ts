import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Data, Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { clampLimit } from 'src/ui/clamp-limit';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { formatToolLogInfo, formatToolLogsTable } from '../format';
import { commandHintStep } from 'src/services/command-hints';
import { toSearchParam } from '../utils';

class ToolLogsRequestError extends Data.TaggedError('commands/ToolLogsRequestError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

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

const cursor = Flag.integer('cursor').pipe(
  Flag.optional,
  Flag.withDescription('Cursor for pagination')
);

const from = Flag.integer('from').pipe(
  Flag.withDescription('Start timestamp (epoch milliseconds)'),
  Flag.optional
);

const to = Flag.integer('to').pipe(
  Flag.withDescription('End timestamp (epoch milliseconds)'),
  Flag.optional
);

const limit = Flag.integer('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of logs to fetch (1-1000)')
);

const caseSensitive = Flag.boolean('case-sensitive').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Whether search params are case-sensitive')
);

const toolkit = Flag.string('toolkit').pipe(
  Flag.withDescription('Filter by toolkit key(s), comma-separated (e.g. "gmail,slack")'),
  Flag.optional
);

const tool = Flag.string('tool').pipe(
  Flag.withDescription('Filter by tool key(s), comma-separated (e.g. "GMAIL_SEND_EMAIL")'),
  Flag.optional
);

const connectedAccountId = Flag.string('connected-account-id').pipe(
  Flag.withDescription('Filter by connected account id(s), comma-separated'),
  Flag.optional
);

const authConfigId = Flag.string('auth-config-id').pipe(
  Flag.withDescription('Filter by auth config id(s), comma-separated'),
  Flag.optional
);

const status = Flag.string('status').pipe(
  Flag.withDescription('Filter by execution status value(s), comma-separated'),
  Flag.optional
);

const userId = Flag.string('user-id').pipe(
  Flag.withDescription('Filter by user id(s), comma-separated'),
  Flag.optional
);

const logIdFilter = Flag.string('log-id').pipe(
  Flag.withDescription('Filter by log id(s), comma-separated'),
  Flag.optional
);

const toolRouterSessionId = Flag.string('tool-router-session-id').pipe(
  Flag.withDescription('Filter by tool router session id(s), comma-separated'),
  Flag.optional
);

const sessionId = Flag.string('session-id').pipe(
  Flag.withDescription('Filter by session id(s), comma-separated'),
  Flag.optional
);

const logId = Argument.string('log_id').pipe(
  Argument.withDescription('Tool log ID'),
  Argument.optional
);

/**
 * List tool execution logs with optional filters.
 *
 * @example
 * ```bash
 * composio dev logs tools --limit 50
 * composio dev logs tools <log_id>
 * composio dev logs tools --toolkit gmail --tool GMAIL_SEND_EMAIL
 * composio dev logs tools --connected-account-id con_123 --user-id user_123
 * composio dev logs tools --status success --auth-config-id ac_123
 * composio dev logs tools --from 1735689600000 --to 1735776000000
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
          Effect.tryPromise({
            try: () => client.logs.tools.retrieve(toolLogId),
            catch: cause =>
              new ToolLogsRequestError({
                message: `Failed to fetch tool log "${toolLogId}".`,
                cause,
              }),
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
            client.logs.tools.list({
              cursor: Option.getOrUndefined(cursor) ?? null,
              from: Option.getOrUndefined(from),
              to: Option.getOrUndefined(to),
              limit: clampedLimit,
              case_sensitive: caseSensitive,
              search_params: shorthandSearchParams.length > 0 ? shorthandSearchParams : undefined,
            }),
          catch: cause =>
            new ToolLogsRequestError({
              message: 'Failed to fetch tool logs.',
              cause,
            }),
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
