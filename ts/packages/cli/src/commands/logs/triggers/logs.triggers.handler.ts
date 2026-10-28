import type { TriggerListParams } from '@composio/client/resources/_internal/logs';
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
import { formatTriggerLogInfo, formatTriggerLogsTable } from '../format';
import { decodeTriggerLogRecord } from '../trigger-log-record';
import { toSearchParam, type SearchParam } from '../utils';
import { TriggerLogsRequestError } from './logs.triggers.errors';

export type LogsTriggersParams = {
  readonly logId: Option.Option<string>;
  readonly cursor: Option.Option<string>;
  /** Read only when the `dev` group's shared `--user-id` is absent. */
  readonly userId: Option.Option<string>;
  readonly connectedAccountId: Option.Option<string>;
  readonly trigger: Option.Option<string>;
  readonly triggerId: Option.Option<string>;
  readonly logIdFilter: Option.Option<string>;
  readonly from: Option.Option<number>;
  readonly to: Option.Option<number>;
  readonly limit: number;
  readonly time: Option.Option<NonNullable<TriggerListParams['time']>>;
  readonly search: Option.Option<string>;
  readonly includePayload: boolean;
};

/**
 * One `==` search param per comma-separated value of each present filter, in
 * the order the filters are given.
 */
export const triggerLogSearchParams = (
  filters: ReadonlyArray<readonly [field: string, filter: Option.Option<string>]>
): Array<SearchParam> =>
  Arr.flatMap(filters, ([field, filter]) =>
    Option.match(filter, {
      onNone: () => [],
      onSome: csv => parseCsv(csv).map(value => toSearchParam(field, value)),
    })
  );

const showTriggerLog = (triggerLogId: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const client = yield* (yield* ComposioClientSingleton).get();
    const triggerLog = yield* ui.withSpinner(
      `Fetching trigger log "${triggerLogId}"...`,
      client._internal.logs.triggers
        .retrieve(triggerLogId, idempotent)
        .pipe(failedWith(TriggerLogsRequestError, `Failed to fetch trigger log "${triggerLogId}".`))
    );
    const record = decodeTriggerLogRecord(triggerLog);

    yield* ui.log.info(
      `${formatTriggerLogInfo(record)}\n\nPayload:\n${JSON.stringify(record.payload, null, 2)}\n\nResponse:\n${JSON.stringify(record.response, null, 2)}`
    );
    // Raw API payload for scripts; only human-readable formatting uses the decoded record.
    yield* ui.output(JSON.stringify(triggerLog, null, 2));
  });

const listTriggerLogs = ({
  cursor,
  userId,
  connectedAccountId,
  trigger,
  triggerId,
  logIdFilter,
  from,
  to,
  limit,
  time,
  search,
  includePayload,
}: LogsTriggersParams) =>
  Effect.gen(function* () {
    const userIdFilter = Option.orElse((yield* CommandSurface).userId, () => userId);
    const ui = yield* TerminalUI;
    const client = yield* (yield* ComposioClientSingleton).get();
    const searchParams = triggerLogSearchParams([
      ['trigger_name', trigger],
      ['trigger_id', triggerId],
      ['user_id', userIdFilter],
      ['connected_account_id', connectedAccountId],
      ['log_id', logIdFilter],
    ]);

    const response = yield* ui.withSpinner(
      'Fetching trigger logs...',
      client._internal.logs.triggers
        .list(
          {
            ...optionalParams({ cursor, from, to, time, search }),
            limit: clampLimit(limit),
            include_payload: includePayload,
            search_params: nonEmptyOrUndefined(searchParams),
          },
          idempotent
        )
        .pipe(failedWith(TriggerLogsRequestError, 'Failed to fetch trigger logs.'))
    );

    yield* Arr.match(response.data ?? [], {
      onEmpty: () => ui.log.warn('No trigger logs found for the given filters.'),
      onNonEmpty: logs =>
        Effect.gen(function* () {
          yield* ui.log.info(
            `Listing ${logs.length} trigger log${logs.length === 1 ? '' : 's'}\n\n${formatTriggerLogsTable(logs.map(decodeTriggerLogRecord))}`
          );

          const firstLogId = Arr.headNonEmpty(logs).id;
          if (firstLogId) {
            yield* ui.log.step(
              commandHintStep('To view full details for a log', 'dev.logs.triggers', {
                logId: firstLogId,
              })
            );
          }

          if (response.nextCursor) {
            yield* ui.log.step(`Next cursor: ${response.nextCursor}`);
          }
        }),
    });

    yield* ui.output(JSON.stringify(response, null, 2));
  });

/**
 * Show one trigger log when a log id is given, otherwise list trigger logs
 * with optional filters.
 *
 * @example
 * ```bash
 * composio dev logs triggers <log_id>
 * composio dev logs triggers --trigger GMAIL_NEW_GMAIL_MESSAGE
 * composio dev logs triggers --trigger-id 77ac1dbf-6db0-4039-8dbe-e903b3f2057e
 * composio dev logs triggers --connected-account-id ca_123 --user-id user_123
 * composio dev logs triggers --log-id log_123
 * ```
 */
export const runLogsTriggers = (params: LogsTriggersParams) =>
  Effect.gen(function* () {
    return yield* Option.match(Option.filter(params.logId, Str.isNonEmpty), {
      onSome: showTriggerLog,
      onNone: () => listTriggerLogs(params),
    });
  });
