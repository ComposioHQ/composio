import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { clampLimit } from 'src/ui/clamp-limit';
import { parseCsv } from 'src/commands/triggers/parse-csv';
import { formatTriggerLogInfo, formatTriggerLogsTable } from '../format';
import { commandHintStep } from 'src/services/command-hints';
import { toSearchParam } from '../utils';

const cursor = Options.text('cursor').pipe(
  Options.withDescription('Cursor for pagination'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDescription('Filter by user id'),
  Options.optional
);

const connectedAccountId = Options.text('connected-account-id').pipe(
  Options.withDescription('Filter by connected account id'),
  Options.optional
);

const trigger = Options.text('trigger').pipe(
  Options.withDescription('Filter by trigger name'),
  Options.optional
);

const triggerId = Options.text('trigger-id').pipe(
  Options.withDescription('Filter by trigger id'),
  Options.optional
);

const logIdFilter = Options.text('log-id').pipe(
  Options.withDescription('Filter by log id'),
  Options.optional
);

const logId = Args.text({ name: 'log_id' }).pipe(
  Args.withDescription('Trigger log ID'),
  Args.optional
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
          Effect.tryPromise(() => client.logs.triggers.retrieve(triggerLogId))
        );
        const triggerLogData = triggerLog as unknown as Record<string, unknown>;
        const normalizedLogData = getTriggerLogRecord(triggerLogData);
        const payload = getTriggerPayload(normalizedLogData);
        const response = getTriggerResponse(normalizedLogData);

        yield* ui.log.info(
          `${formatTriggerLogInfo(triggerLog)}\n\nPayload:\n${JSON.stringify(payload, null, 2)}\n\nResponse:\n${JSON.stringify(response, null, 2)}`
        );
        yield* ui.output(JSON.stringify(triggerLog, null, 2));
        return;
      }

      const response = yield* ui.withSpinner(
        'Fetching trigger logs...',
        Effect.tryPromise(() =>
          client.logs.triggers.list({
            cursor: Option.getOrUndefined(cursor),
            from: Option.getOrUndefined(from),
            to: Option.getOrUndefined(to),
            limit: clampedLimit,
            time: Option.getOrUndefined(time),
            search: Option.getOrUndefined(search),
            include_payload: includePayload,
            search_params: shorthandSearchParams.length > 0 ? shorthandSearchParams : undefined,
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

export const getTriggerLogRecord = (record: Record<string, unknown>): Record<string, unknown> => {
  const log = record.log;
  if (log && typeof log === 'object') return log as Record<string, unknown>;
  return record;
};

export const getTriggerPayload = (record: Record<string, unknown>): unknown => {
  const meta = record.meta;
  const metaRecord = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  const rawPayload =
    metaRecord.triggerProviderPayload ??
    metaRecord.triggerClientPayload ??
    record.payloadReceived ??
    record.payload ??
    null;

  return parseMaybeJson(rawPayload);
};

export const getTriggerResponse = (record: Record<string, unknown>): unknown => {
  const meta = record.meta;
  const metaRecord = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  const rawResponse =
    metaRecord.triggerClientResponse ??
    metaRecord.triggerProviderResponse ??
    record.response ??
    null;

  return parseMaybeJson(rawResponse);
};

export const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
};
