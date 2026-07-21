import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Data, Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { clampLimit } from 'src/ui/clamp-limit';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { formatTriggerLogInfo, formatTriggerLogsTable } from '../format';
import { decodeTriggerLogRecord } from '../trigger-log-record';
import { commandHintStep } from 'src/services/command-hints';
import { toSearchParam } from '../utils';

class TriggerLogsRequestError extends Data.TaggedError('commands/TriggerLogsRequestError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const cursor = Flag.string('cursor').pipe(
  Flag.withDescription('Cursor for pagination'),
  Flag.optional
);

const userId = Flag.string('user-id').pipe(
  Flag.withDescription('Filter by user id'),
  Flag.optional
);

const connectedAccountId = Flag.string('connected-account-id').pipe(
  Flag.withDescription('Filter by connected account id'),
  Flag.optional
);

const trigger = Flag.string('trigger').pipe(
  Flag.withDescription('Filter by trigger name'),
  Flag.optional
);

const triggerId = Flag.string('trigger-id').pipe(
  Flag.withDescription('Filter by trigger id'),
  Flag.optional
);

const logIdFilter = Flag.string('log-id').pipe(
  Flag.withDescription('Filter by log id'),
  Flag.optional
);

const logId = Argument.string('log_id').pipe(
  Argument.withDescription('Trigger log ID'),
  Argument.optional
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

const time = Flag.choice('time', ['5m', '30m', '6h', '1d', '1w', '1month', '1y'] as const).pipe(
  Flag.optional,
  Flag.withDescription('Show logs from a relative time window')
);

const search = Flag.string('search').pipe(
  Flag.withDescription('Full-text search query'),
  Flag.optional
);

const includePayload = Flag.boolean('include-payload').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Include payload fields in response')
);

/**
 * List trigger logs with optional filters.
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
export const logsCmd$Triggers = Command.make(
  'triggers',
  {
    logId,
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
  },
  ({
    logId,
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
  }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const clientSingleton = yield* ComposioClientSingleton;
      const client = yield* clientSingleton.get();
      const clampedLimit = clampLimit(limit);
      const shorthandSearchParams = [
        ...(Option.isSome(trigger)
          ? parseCsv(trigger.value).map(value => toSearchParam('trigger_name', value))
          : []),
        ...(Option.isSome(triggerId)
          ? parseCsv(triggerId.value).map(value => toSearchParam('trigger_id', value))
          : []),
        ...(Option.isSome(userId)
          ? parseCsv(userId.value).map(value => toSearchParam('user_id', value))
          : []),
        ...(Option.isSome(connectedAccountId)
          ? parseCsv(connectedAccountId.value).map(value =>
              toSearchParam('connected_account_id', value)
            )
          : []),
        ...(Option.isSome(logIdFilter)
          ? parseCsv(logIdFilter.value).map(value => toSearchParam('log_id', value))
          : []),
      ];
      const triggerLogId = Option.getOrUndefined(logId);

      if (triggerLogId) {
        const triggerLog = yield* ui.withSpinner(
          `Fetching trigger log "${triggerLogId}"...`,
          Effect.tryPromise({
            try: () => client.logs.triggers.retrieve(triggerLogId),
            catch: cause =>
              new TriggerLogsRequestError({
                message: `Failed to fetch trigger log "${triggerLogId}".`,
                cause,
              }),
          })
        );
        const record = decodeTriggerLogRecord(triggerLog);

        yield* ui.log.info(
          `${formatTriggerLogInfo(record)}\n\nPayload:\n${JSON.stringify(record.payload, null, 2)}\n\nResponse:\n${JSON.stringify(record.response, null, 2)}`
        );
        // Raw API payload for scripts; only human-readable formatting uses the decoded record.
        yield* ui.output(JSON.stringify(triggerLog, null, 2));
        return;
      }

      const response = yield* ui.withSpinner(
        'Fetching trigger logs...',
        Effect.tryPromise({
          try: () =>
            client.logs.triggers.list({
              cursor: Option.getOrUndefined(cursor),
              from: Option.getOrUndefined(from),
              to: Option.getOrUndefined(to),
              limit: clampedLimit,
              time: Option.getOrUndefined(time),
              search: Option.getOrUndefined(search),
              include_payload: includePayload,
              search_params: shorthandSearchParams.length > 0 ? shorthandSearchParams : undefined,
            }),
          catch: cause =>
            new TriggerLogsRequestError({
              message: 'Failed to fetch trigger logs.',
              cause,
            }),
        })
      );

      const logs = response.data ?? [];

      if (logs.length === 0) {
        yield* ui.log.warn('No trigger logs found for the given filters.');
        yield* ui.output(JSON.stringify(response, null, 2));
        return;
      }

      yield* ui.log.info(
        `Listing ${logs.length} trigger log${logs.length === 1 ? '' : 's'}\n\n${formatTriggerLogsTable(logs.map(decodeTriggerLogRecord))}`
      );

      const firstLogId = logs[0]?.id;
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

      yield* ui.output(JSON.stringify(response, null, 2));
    })
).pipe(Command.withDescription('List trigger logs.'));
