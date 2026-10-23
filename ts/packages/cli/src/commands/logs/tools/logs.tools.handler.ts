import { Array as Arr, Effect, Option, String as Str } from 'effect';
import { CommandSurface } from 'src/commands/surface';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { failedWith } from 'src/effects/request-error';
import { commandHintStep } from 'src/services/command-hints';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { nonEmptyOrUndefined, optionalParams } from 'src/utils/optional-params';
import { formatToolLogInfo, formatToolLogsTable } from '../format';
import { toSearchParam, type SearchParam } from '../utils';
import { ToolLogsRequestError } from './logs.tools.errors';

export type LogsToolsParams = {
  readonly logId: Option.Option<string>;
  readonly cursor: Option.Option<number>;
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
  readonly sessionId?: string;
};

/** The search field each filter is sent as, in the order the filters are sent. */
const TOOL_LOG_FILTER_FIELDS = [
  ['tool', 'action_key'],
  ['toolkit', 'toolkit_key'],
  ['connectedAccountId', 'connected_account_id'],
  ['authConfigId', 'auth_config_id'],
  ['status', 'execution_status'],
  ['userId', 'user_id'],
  ['logId', 'log_id'],
  ['toolRouterSessionId', 'tool_router_session_id'],
  ['sessionId', 'session_id'],
] as const satisfies ReadonlyArray<readonly [keyof ToolLogFilterInput, string]>;

/**
 * One `==` search param per comma-separated value of each present filter, in
 * the order of `TOOL_LOG_FILTER_FIELDS`.
 */
export const buildToolLogShorthandSearchParams = (
  filters: ToolLogFilterInput
): Array<SearchParam> =>
  Arr.flatMap(TOOL_LOG_FILTER_FIELDS, ([key, field]) =>
    Option.match(Option.fromUndefinedOr(filters[key]), {
      onNone: () => [],
      onSome: csv => parseCsv(csv).map(value => toSearchParam(field, value)),
    })
  );

const showToolLog = (toolLogId: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const client = yield* (yield* ComposioClientSingleton).get();
    const toolLog = yield* ui.withSpinner(
      `Fetching tool log "${toolLogId}"...`,
      client._internal.logs.tools
        .retrieve(toolLogId, idempotent)
        .pipe(failedWith(ToolLogsRequestError, `Failed to fetch tool log "${toolLogId}".`))
    );

    yield* ui.log.info(
      `${formatToolLogInfo(toolLog)}\n\nPayload:\n${JSON.stringify(toolLog.payloadReceived, null, 2)}\n\nResponse:\n${JSON.stringify(toolLog.response, null, 2)}`
    );
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
    const client = yield* (yield* ComposioClientSingleton).get();
    const searchParams = buildToolLogShorthandSearchParams(
      optionalParams({
        tool,
        toolkit,
        connectedAccountId,
        authConfigId,
        status,
        userId: userIdFilter,
        logId: logIdFilter,
        toolRouterSessionId,
        sessionId,
      })
    );

    const response = yield* ui.withSpinner(
      'Fetching tool logs...',
      client._internal.logs.tools
        .list(
          {
            ...optionalParams({ from, to }),
            cursor: Option.getOrNull(cursor),
            limit: clampLimit(limit),
            case_sensitive: caseSensitive,
            search_params: nonEmptyOrUndefined(searchParams),
          },
          idempotent
        )
        .pipe(failedWith(ToolLogsRequestError, 'Failed to fetch tool logs.'))
    );

    yield* Arr.match(response.data ?? [], {
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

          if (response.nextCursor !== null && response.nextCursor !== undefined) {
            yield* ui.log.step(`Next cursor: ${response.nextCursor}`);
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
