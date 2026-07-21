import { Command, Flag } from 'effect/unstable/cli';
import { Deferred, Effect, FileSystem, Option, Path } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { matchesTriggerListenFilters } from '../filter';
import {
  formatTriggerListenSummary,
  formatTriggerListenTableHeader,
  formatTriggerListenTableRow,
} from '../format';
import { parseCsv } from '../parse-csv';
import { parseTriggerListenEvent } from '../parse';
import type { TriggerListenFilters } from '../types';
import {
  resolveCommandProject,
  formatResolveCommandProjectError,
} from 'src/services/command-project';

const toolkits = Flag.string('toolkits').pipe(
  Flag.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'),
  Flag.optional
);

const triggerId = Flag.string('trigger-id').pipe(
  Flag.withDescription('Filter by trigger id'),
  Flag.optional
);

const connectedAccountId = Flag.string('connected-account-id').pipe(
  Flag.withDescription('Filter by connected account id'),
  Flag.optional
);

const triggerSlug = Flag.string('trigger-slug').pipe(
  Flag.withDescription('Filter by trigger slug, comma-separated (e.g. "GMAIL_NEW_GMAIL_MESSAGE")'),
  Flag.optional
);

const userId = Flag.string('user-id').pipe(
  Flag.withDescription('Filter by user id'),
  Flag.optional
);

const json = Flag.boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Show raw event payload as JSON in interactive mode')
);

const table = Flag.boolean('table').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Show compact table rows: timestamp, trigger_id, trigger_slug, toolkit, user_id, connected_account_id'
  )
);

const maxEvents = Flag.integer('max-events').pipe(
  Flag.withDescription('Stop after receiving N matching events'),
  Flag.optional
);

const forward = Flag.string('forward').pipe(
  Flag.withDescription(
    'Forward each matching event to the given URL (signed with COMPOSIO_WEBHOOK_SECRET)'
  ),
  Flag.optional
);

const out = Flag.string('out').pipe(
  Flag.withDescription('Append each matching event to this file'),
  Flag.optional
);

const randomUUID = () => crypto.randomUUID();

const signWebhookPayload = async ({
  secret,
  webhookId,
  webhookTimestamp,
  payload,
}: {
  secret: string;
  webhookId: string;
  webhookTimestamp: string;
  payload: string;
}) => {
  const toSign = `${webhookId}.${webhookTimestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  const bytes = new Uint8Array(signature);
  const digest = btoa(String.fromCharCode(...bytes));
  return `v1,${digest}`;
};

const detectWebhookPayloadVersion = (eventData: Record<string, unknown>): 'V1' | 'V2' | 'V3' => {
  if (
    typeof eventData.id === 'string' &&
    typeof eventData.type === 'string' &&
    typeof eventData.timestamp === 'string' &&
    typeof eventData.metadata === 'object' &&
    eventData.metadata !== null &&
    typeof eventData.data === 'object' &&
    eventData.data !== null
  ) {
    return 'V3';
  }

  if (
    typeof eventData.type === 'string' &&
    typeof eventData.timestamp === 'string' &&
    typeof eventData.log_id === 'string' &&
    typeof eventData.data === 'object' &&
    eventData.data !== null
  ) {
    return 'V2';
  }

  return 'V1';
};

const emitTableLine = (line: string, ui: TerminalUI): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* ui.log.message(line);
    yield* ui.output(line);
  });

/**
 * Listen to realtime trigger events for your project.
 *
 * @example
 * ```bash
 * composio dev triggers listen --toolkits gmail --table
 * composio dev triggers listen --trigger-slug GMAIL_NEW_GMAIL_MESSAGE --json --max-events 5
 * composio dev triggers listen --forward "http://localhost:8080/webhook" --out events.jsonl
 * ```
 */
export const triggersCmd$Listen = Command.make(
  'listen',
  {
    toolkits,
    triggerId,
    connectedAccountId,
    triggerSlug,
    userId,
    json,
    table,
    maxEvents,
    forward,
    out,
  },
  ({
    toolkits,
    triggerId,
    connectedAccountId,
    triggerSlug,
    userId,
    json,
    table,
    maxEvents,
    forward,
    out,
  }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      yield* resolveCommandProject({ mode: 'developer' }).pipe(
        Effect.mapError(formatResolveCommandProjectError)
      );
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const realtime = yield* TriggersRealtime;
      const services = yield* Effect.context<never>();
      const forwardUrl = Option.getOrUndefined(forward);
      const generatedWebhookSecret = `composio-forward-secret-${randomUUID()}`;
      // eslint-disable-next-line no-restricted-syntax -- the forward signing secret is an optional raw passthrough from the user's shell; its literal presence/absence selects the generated-secret fallback
      const webhookSecret = process.env.COMPOSIO_WEBHOOK_SECRET ?? generatedWebhookSecret;
      const outputFilePathOption = Option.getOrUndefined(out);
      const outputFilePath = outputFilePathOption ? path.resolve(outputFilePathOption) : undefined;

      if (outputFilePath) {
        // Ensure output directory exists before listening.
        yield* fs
          .makeDirectory(path.dirname(outputFilePath), { recursive: true })
          .pipe(Effect.tapError(error => ui.log.error(String(error))));
      }

      const filters: TriggerListenFilters = {
        toolkits: Option.isSome(toolkits) ? parseCsv(toolkits.value) : undefined,
        triggerId: Option.getOrUndefined(triggerId),
        connectedAccountId: Option.getOrUndefined(connectedAccountId),
        triggerSlug: Option.isSome(triggerSlug) ? parseCsv(triggerSlug.value) : undefined,
        userId: Option.getOrUndefined(userId),
      };

      const maxEventsLimit = Option.getOrUndefined(maxEvents);
      const stopWhenDone = yield* Deferred.make<void>();
      let matchingEvents = 0;
      let tableHeaderPrinted = false;

      yield* ui.intro('composio dev triggers listen');
      if (forwardUrl) {
        // eslint-disable-next-line no-restricted-syntax -- re-checks the same raw env var to tell the user whether they supplied a secret or this session generated one
        if (process.env.COMPOSIO_WEBHOOK_SECRET) {
          yield* ui.note(
            `Forward URL: ${forwardUrl}\nSigning secret: ${webhookSecret}`,
            'Forwarding'
          );
        } else {
          yield* ui.log.warn(
            'No COMPOSIO_WEBHOOK_SECRET found. Generating a signing secret for this session.'
          );
          yield* ui.note(
            `Forward URL: ${forwardUrl}\nGenerated signing secret: ${webhookSecret}`,
            'Forwarding'
          );
        }
      }
      yield* ui.log.info('Listening for realtime trigger events. Press Ctrl+C to stop.');
      if (outputFilePath) {
        yield* ui.log.info(`Writing matching events to: ${outputFilePath}`);
      }

      if (maxEventsLimit !== undefined) {
        yield* ui.log.info(`Auto-stop after ${maxEventsLimit} matching events.`);
      }

      const onEvent = (eventData: Record<string, unknown>) => {
        Effect.runForkWith(services)(
          Effect.gen(function* () {
            const parsed = parseTriggerListenEvent(eventData);
            if (!matchesTriggerListenFilters(filters, parsed)) {
              return;
            }

            matchingEvents += 1;
            if (table) {
              if (!tableHeaderPrinted) {
                yield* emitTableLine(formatTriggerListenTableHeader(), ui);
                tableHeaderPrinted = true;
              }

              const tableLine = formatTriggerListenTableRow({
                timestamp:
                  typeof eventData.timestamp === 'string'
                    ? eventData.timestamp
                    : new Date().toISOString(),
                event: parsed,
              });

              yield* emitTableLine(tableLine, ui);
            } else if (json) {
              yield* ui.note(formatTriggerListenSummary(parsed), `Event #${matchingEvents}`);
              yield* ui.log.message(JSON.stringify(eventData, null, 2));
              yield* ui.output(JSON.stringify(eventData));
            } else {
              yield* ui.note(formatTriggerListenSummary(parsed), `Event #${matchingEvents}`);
              yield* ui.log.message(JSON.stringify(parsed.payload, null, 2));
              yield* ui.output(JSON.stringify(eventData));
            }

            const payloadForForwarding = JSON.stringify(eventData);
            const logLine = `${payloadForForwarding}\n`;

            if (outputFilePath) {
              yield* fs
                .writeFileString(outputFilePath, logLine, { flag: 'a' })
                .pipe(Effect.catch(error => ui.log.warn(String(error))));
            }

            if (forwardUrl && webhookSecret) {
              yield* Effect.gen(function* () {
                const webhookId =
                  typeof eventData.id === 'string' && eventData.id.length > 0
                    ? eventData.id
                    : randomUUID();
                const webhookTimestamp = `${Math.floor(Date.now() / 1000)}`;
                const webhookSignature = yield* Effect.tryPromise({
                  try: () =>
                    signWebhookPayload({
                      secret: webhookSecret,
                      webhookId,
                      webhookTimestamp,
                      payload: payloadForForwarding,
                    }),
                  catch: error => new Error(`Failed to sign webhook payload: ${String(error)}`),
                });
                const webhookVersion = detectWebhookPayloadVersion(eventData);

                yield* Effect.tryPromise({
                  try: async () => {
                    const response = await fetch(forwardUrl, {
                      method: 'POST',
                      headers: {
                        'content-type': 'application/json',
                        'webhook-id': webhookId,
                        'webhook-timestamp': webhookTimestamp,
                        'webhook-signature': webhookSignature,
                        'webhook-version': webhookVersion,
                      },
                      body: payloadForForwarding,
                    });
                    if (!response.ok) {
                      throw new Error(`Forwarding failed with HTTP ${response.status}`);
                    }
                  },
                  catch: error =>
                    new Error(`Failed forwarding event to ${forwardUrl}: ${String(error)}`),
                });
              }).pipe(Effect.catch(error => ui.log.warn(String(error))));
            }

            if (maxEventsLimit !== undefined && matchingEvents >= maxEventsLimit) {
              yield* Deferred.succeed(stopWhenDone, undefined).pipe(Effect.ignore);
            }
          })
        );
      };

      const listenEffect = realtime
        .listen(onEvent)
        .pipe(
          Effect.onInterrupt(() => ui.log.info('Stopped listening for realtime trigger events.'))
        );

      yield* Effect.gen(function* () {
        if (maxEventsLimit === undefined) {
          yield* listenEffect;
          return;
        }

        yield* Effect.raceFirst(listenEffect, Deferred.await(stopWhenDone));
        yield* ui.outro(`Stopped after receiving ${matchingEvents} matching events.`);
      }).pipe(
        Effect.catchTag('services/TriggerRealtimeSubscriptionError', error =>
          Effect.gen(function* () {
            yield* ui.log.error(
              `Could not subscribe to realtime trigger events: ${error.message}. Check your network connection or run \`composio login\`.`
            );
            process.exitCode = 1;
          })
        )
      );
    })
).pipe(
  Command.withDescription(
    'Listen to realtime trigger events for your developer project and optionally forward them into your local dev environment.'
  )
);
