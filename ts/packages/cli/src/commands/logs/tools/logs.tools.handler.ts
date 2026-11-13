import type { LogCreateToolExecutionParams } from '@composio/client/resources/logs';
import { Array as Arr, Clock, Effect, Option, String as Str } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { CommandSurface } from 'src/commands/surface';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { failedWith } from 'src/effects/request-error';
import { commandHintStep } from 'src/services/command-hints';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { TerminalUI } from 'src/services/terminal-ui';
import { nonEmptyOrUndefined, optionalParams } from 'src/utils/optional-params';
import { formatToolLogInfo, formatToolLogsTable } from '../format';
import { ToolLogsRequestError } from './logs.tools.errors';

export type LogsToolsParams = {
  readonly logId: Option.Option<string>;
  readonly cursor: Option.Option<string>;
  readonly from: Option.Option<number>;
  readonly to: Option.Option<number>;
  readonly limit: number;
  readonly caseSensitive: boolean;
  readonly toolkit: Option.Option<string>;
  readonly tool: Option.Option<string>;
  readonly connectedAccountId: Option.Option<string>;
  readonly authConfigId: Option.Option<string>;
  readonly status: Option.Option<string>;
  /** Read only when the `dev` group's shared `--user-id` is absent. */
  readonly userId: Option.Option<string>;
  readonly logIdFilter: Option.Option<string>;
  readonly toolRouterSessionId: Option.Option<string>;
  readonly sessionId: Option.Option<string>;
};

type ToolLogFilterInput = {
  readonly tool?: string;
  readonly toolkit?: string;
  readonly connectedAccountId?: string;
  readonly authConfigId?: string;
  readonly status?: string;
  readonly userId?: string;
  readonly logId?: string;
  readonly toolRouterSessionId?: string;
};

/**
 * The search field each filter is sent as and the flag that sets it, in the
 * order the filters are sent.
 */
const TOOL_LOG_FILTER_FIELDS = [
  ['tool', 'tool_slug', '--tool'],
  ['toolkit', 'toolkit_slug', '--toolkit'],
  ['connectedAccountId', 'connected_account_id', '--connected-account-id'],
  ['authConfigId', 'auth_config_id', '--auth-config-id'],
  ['status', 'status', '--status'],
  ['userId', 'user_id', '--user-id'],
  ['logId', 'log_id', '--log-id'],
  ['toolRouterSessionId', 'session_id', '--tool-router-session-id'],
] as const satisfies ReadonlyArray<readonly [keyof ToolLogFilterInput, string, string]>;

/**
 * The flag of the first filter given more than one comma-separated value. The
 * public API combines filters with AND, so several values for one field would
 * match nothing.
 */
const findMultiValuedFilter = (filters: ToolLogFilterInput): Option.Option<string> =>
  Arr.findFirst(TOOL_LOG_FILTER_FIELDS, ([key]) => parseCsv(filters[key] ?? '').length > 1).pipe(
    Option.map(([, , flag]) => flag)
  );

/** One equality filter for each present flag, in the order of `TOOL_LOG_FILTER_FIELDS`. */
const buildToolLogFilters = (
  filters: ToolLogFilterInput
): NonNullable<LogCreateToolExecutionParams['filters']> =>
  Arr.flatMap(TOOL_LOG_FILTER_FIELDS, ([key, field]) =>
    parseCsv(filters[key] ?? '').map(value => ({ field, operator: '==' as const, value }))
  );

const showToolLog = (toolLogId: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const client = yield* (yield* ComposioClientSingleton).get();
    const toolLog = yield* ui.withSpinner(
      `Fetching tool log "${toolLogId}"...`,
      client.logs
        .retrieveToolExecution(toolLogId, idempotent)
        .pipe(failedWith(ToolLogsRequestError, `Failed to fetch tool log "${toolLogId}".`))
    );

    yield* ui.log.info(formatToolLogInfo(toolLog));
    yield* ui.output(JSON.stringify(toolLog, null, 2));
  });

const listToolLogs = ({
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
}: LogsToolsParams) =>
  Effect.gen(function* () {
    const userIdFilter = Option.orElse((yield* CommandSurface).userId, () => userId);
    const ui = yield* TerminalUI;
    const now = yield* Clock.currentTimeMillis;
    const invalidInput = commandInputError('dev logs tools');
    if (caseSensitive) {
      return yield* invalidInput(
        'The public tool logs API does not support --case-sensitive. Remove this flag.',
        '--case-sensitive'
      );
    }
    if (Option.isSome(sessionId)) {
      return yield* invalidInput(
        'The public tool logs API does not support the legacy --session-id filter. Use --tool-router-session-id for a Tool Router session.',
        '--session-id'
      );
    }
    const filterInput = optionalParams({
      tool,
      toolkit,
      connectedAccountId,
      authConfigId,
      status,
      userId: userIdFilter,
      logId: logIdFilter,
      toolRouterSessionId,
    });
    const multiValuedFlag = findMultiValuedFilter(filterInput);
    if (Option.isSome(multiValuedFlag)) {
      return yield* invalidInput(
        `The public tool logs API matches one value per filter. Pass a single value to ${multiValuedFlag.value}.`,
        multiValuedFlag.value
      );
    }
    if (
      Option.isSome(status) &&
      parseCsv(status.value).some(value => value !== 'success' && value !== 'failed')
    ) {
      return yield* invalidInput('Use success or failed for --status.', '--status');
    }
    const timeRange =
      Option.isSome(from) || Option.isSome(to)
        ? { from: Option.getOrElse(from, () => 0), to: Option.getOrElse(to, () => now) }
        : undefined;
    const filters = buildToolLogFilters(filterInput);

    const client = yield* (yield* ComposioClientSingleton).get();
    // The client names this read-only search POST createToolExecution.
    const response = yield* ui.withSpinner(
      'Fetching tool logs...',
      client.logs
        .createToolExecution(
          {
            time_range: timeRange,
            cursor: Option.getOrNull(cursor),
            limit: Math.max(1, Math.min(100, limit)),
            filters: nonEmptyOrUndefined(filters),
          },
          idempotent
        )
        .pipe(failedWith(ToolLogsRequestError, 'Failed to fetch tool logs.'))
    );

    yield* Arr.match(response.logs ?? [], {
      onEmpty: () => ui.log.warn('No tool logs found for the given filters.'),
      onNonEmpty: logs =>
        Effect.gen(function* () {
          yield* ui.log.info(
            `Listing ${logs.length} tool log${logs.length === 1 ? '' : 's'}\n\n${formatToolLogsTable(logs)}`
          );

          const firstLogId = Arr.headNonEmpty(logs).id;
          if (firstLogId) {
            yield* ui.log.step(
              commandHintStep('To view full details for a log', 'dev.logs.tools', {
                logId: firstLogId,
              })
            );
          }

          if (response.next_cursor !== null && response.next_cursor !== undefined) {
            yield* ui.log.step(`Next cursor: ${response.next_cursor}`);
          }
        }),
    });

    yield* ui.output(JSON.stringify(response, null, 2));
  });

/**
 * Show one tool log when a log id is given, otherwise list tool execution logs
 * with optional filters.
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
export const runLogsTools = (params: LogsToolsParams) =>
  Option.match(Option.filter(params.logId, Str.isNonEmpty), {
    onSome: showToolLog,
    onNone: () => listToolLogs(params),
  });
