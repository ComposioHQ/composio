import { requireLogin } from 'src/effects/require-auth';
import { reportFailure } from 'src/effects/report-failure';
import { eventCount, finishAcceptedEvents, makeSinkFailures } from './triggers/sink-failures';
import { commandInputError } from 'src/commands/errors';
import { Argument, Command, Flag } from 'effect/cli';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { ComposioClientShape } from '@composio/client/effect';
import { Data, Deferred, Effect, FiberSet, Result, Option, Predicate } from 'effect';
import { resolveOptionalTextInput } from 'src/effects/resolve-optional-text-input';
import { ComposioClientSingleton, type ToolkitProjectScope } from 'src/services/composio-clients';
import { actingUser } from 'src/commands/surface';
import {
  resolveArtifactsRoot,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { TerminalUI } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { resolveConnectedAccountForToolkit } from 'src/services/connected-account-selection';
import { parseJsonRecord } from 'src/utils/parse-json';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { matchesTriggerListenFilters } from './triggers/filter';
import { parseTriggerListenEvent } from './triggers/parse';
import { idempotent } from 'src/services/composio-request';

type TriggerCreateParams = NonNullable<
  Parameters<ComposioClientShape['triggerInstances']['upsert']>[1]
>;

export class ListenCommandError extends Data.TaggedError('commands/ListenCommandError')<{
  readonly reason:
    | 'connected_account_not_found'
    | 'unknown_trigger'
    | 'create_trigger'
    | 'disable_trigger';
  readonly message: string;
  readonly slug?: string;
  readonly toolkitSlug?: string;
  readonly cause?: unknown;
}> {}

const invalidOptionValue = commandInputError('listen');

const errorMessage = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

const slug = Argument.String('slug').pipe(
  Argument.withDescription(
    'Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE") or project event type (e.g. "composio.connected_account.expired")'
  )
);

const params = Flag.String('params').pipe(
  Flag.withAlias('p'),
  Flag.withDescription(
    'Trigger create params as JSON/JS object, @file, or - for stdin. Only valid for trigger slugs.'
  ),
  Flag.optional
);

const maxEvents = Flag.Int('max-events').pipe(
  Flag.withDescription('Stop after receiving N matching events'),
  Flag.optional
);

const timeout = Flag.String('timeout').pipe(
  Flag.withDescription('Stop after a duration such as "5m", "1hr", or "30s"'),
  Flag.optional
);

const stream = Flag.String('stream').pipe(
  Flag.withDescription(
    'Also stream each event payload inline. Pass an optional jq-like path such as ".thread.id" or ".data[0].id".'
  ),
  Flag.optional
);
const account = Flag.String('account').pipe(
  Flag.withDescription(
    'Connected account selector. Matches alias, word_id, or connected account id for the inferred toolkit.'
  ),
  Flag.optional
);

const failFast = Flag.Boolean('fail-fast').pipe(
  Flag.withDescription('Stop at the first event that fails to save, and exit 1'),
  Flag.withDefault(false)
);

const debug = Flag.Boolean('debug').pipe(
  Flag.withDescription(
    'Print verbose debug information (raw events, filter results, Pusher state)'
  ),
  Flag.withDefault(false)
);

const sanitizePathPart = (value: string): string =>
  value.replace(/[^A-Z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown';

const disableTemporaryTrigger = (params: {
  client: ComposioClientShape;
  ui: TerminalUI;
  slug: string;
  triggerId: string;
}) =>
  params.client.triggerInstances.manage.update(params.triggerId, { status: 'disable' }).pipe(
    Effect.mapError(
      cause =>
        new ListenCommandError({
          reason: 'disable_trigger',
          // "Error: " is how these messages have always introduced the client's failure.
          message: `Failed to disable temporary trigger "${params.triggerId}": Error: ${cause.message}`,
          slug: params.slug,
          cause,
        })
    ),
    Effect.tapError(error => params.ui.log.warn(error.message)),
    Effect.ignore
  );

const isProjectEventType = (value: string): boolean => value.startsWith('composio.');

const resolveParamsInput = (input: Option.Option<string>) =>
  resolveOptionalTextInput(input, { missingValue: '{}' });

const parseCreateParams = (raw: string) =>
  parseJsonRecord(raw).pipe(
    Result.mapError(error =>
      invalidOptionValue(
        error.reason === 'not-a-record'
          ? "Expected --params to be an object, e.g. -p '{ trigger_config: { ... } }'."
          : "Invalid --params input. Provide JSON or a JS-style object literal, e.g. -p '{ trigger_config: { ... } }'.",
        '--params'
      )
    )
  );

const assertSupportedListenParams = (params: {
  listeningToProjectEvent: boolean;
  slug: string;
  createParamsInput: Record<string, unknown>;
}) =>
  params.listeningToProjectEvent && Object.keys(params.createParamsInput).length > 0
    ? Effect.fail(
        invalidOptionValue(
          `--params is only supported for trigger slugs. "${params.slug}" is a project-level composio.* event type and does not create a temporary trigger.`,
          '--params'
        )
      )
    : Effect.void;

/**
 * Fails with an `unknown_trigger` error when `slug` is not a known trigger type.
 *
 * Called when the toolkit has no active connected account, and when creating the temporary trigger
 * fails, so a mistyped slug is reported as such instead of as a missing connection or a generic
 * creation failure. Neither call site is on the happy path, which makes no additional request.
 */
const assertTriggerTypeExists = (params: {
  client: ComposioClientShape;
  slug: string;
  toolkitSlug?: string;
}) =>
  params.client.triggersTypes.retrieve(params.slug, undefined, idempotent).pipe(
    Effect.catchTag(
      '@composio/client/NotFoundError',
      cause =>
        new ListenCommandError({
          reason: 'unknown_trigger',
          message: `Unknown trigger slug "${params.slug}". List available slugs with \`composio triggers list <toolkit>\`.`,
          slug: params.slug,
          toolkitSlug: params.toolkitSlug,
          cause,
        }),
      // A found trigger type, or any failure other than 404, is inconclusive here: fall through to
      // the caller's own error.
      () => Effect.void
    ),
    Effect.asVoid
  );

const resolveConnectedAccountIdForTrigger = (params: {
  client: ComposioClientShape;
  slug: string;
  consumerUserId: string;
  account: Option.Option<string>;
  projectScope: ToolkitProjectScope;
}) =>
  Effect.gen(function* () {
    const toolkitSlug = yield* toolkitFromToolSlug(params.slug, params.projectScope);
    if (!toolkitSlug) {
      return yield* Effect.fail(
        invalidOptionValue(
          `Could not infer a toolkit from trigger slug "${params.slug}". Use a standard trigger slug such as "GMAIL_NEW_GMAIL_MESSAGE", or a project event type such as "composio.connected_account.expired".`,
          '<slug>'
        )
      );
    }

    // The resolver `composio execute` and `composio proxy` use, so all three pick the same
    // account for the same `--account` (or its absence) and fail the same way when they cannot.
    const connectedAccountId = yield* resolveConnectedAccountForToolkit({
      client: params.client,
      toolkitSlug,
      userId: params.consumerUserId,
      selector: params.account,
    });
    if (connectedAccountId) {
      return connectedAccountId;
    }

    yield* assertTriggerTypeExists({ client: params.client, slug: params.slug, toolkitSlug });

    return yield* new ListenCommandError({
      reason: 'connected_account_not_found',
      message: `No active connected account found for toolkit "${toolkitSlug}" and consumer user "${params.consumerUserId}". Run \`composio link ${toolkitSlug}\` first.`,
      slug: params.slug,
      toolkitSlug,
    });
  });
const emitStreamLine = (line: string, ui: TerminalUI) =>
  Effect.gen(function* () {
    yield* ui.log.message(line);
    yield* ui.output(line, { force: true });
  });

const eventTypeOf = (eventData: Record<string, unknown>): string | undefined =>
  typeof eventData.type === 'string' && eventData.type.length > 0 ? eventData.type : undefined;

const extractEventFileId = (eventData: Record<string, unknown>): string => {
  const metadata = Predicate.isObject(eventData.metadata) ? eventData.metadata : undefined;
  const candidates = [eventData.id, eventData.log_id, metadata?.id];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return sanitizePathPart(candidate);
    }
  }

  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
};

const parseStreamPath = (expression: string) =>
  Effect.gen(function* () {
    const trimmed = expression.trim();
    const pathTokens: Array<string | number> = [];
    // An empty --stream streams the whole event.
    if (trimmed.length === 0) return pathTokens;
    if (!trimmed.startsWith('.')) {
      return yield* Effect.fail(
        invalidOptionValue(
          'Expected --stream to contain a jq-like path starting with "."',
          '--stream'
        )
      );
    }

    const tokenPattern = /(?:\.([A-Za-z0-9_-]+))|(?:\[(\d+)\])/g;
    let lastIndex = 0;

    for (const match of trimmed.matchAll(tokenPattern)) {
      if ((match.index ?? -1) !== lastIndex) {
        return yield* Effect.fail(
          invalidOptionValue(
            'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".',
            '--stream'
          )
        );
      }

      if (match[1]) pathTokens.push(match[1]);
      if (match[2]) pathTokens.push(Number(match[2]));
      lastIndex += match[0].length;
    }

    if (lastIndex !== trimmed.length) {
      return yield* Effect.fail(
        invalidOptionValue(
          'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".',
          '--stream'
        )
      );
    }

    return pathTokens;
  });

const applyStreamPath = (value: unknown, pathTokens: ReadonlyArray<string | number>): unknown => {
  let current = value;
  for (const token of pathTokens) {
    if (typeof token === 'number') {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return undefined;
      }
      current = current[token];
      continue;
    }

    if (!Predicate.isObject(current)) {
      return undefined;
    }

    current = current[token];
  }

  return current;
};

const formatStreamValue = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

/**
 * Saves one matched event: its payload file, its line in the stream file, then the `event:` line
 * and, when streaming (`streamPath` set), the `stream:` line.
 */
const saveListenEvent = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly ui: TerminalUI;
  readonly eventData: Record<string, unknown>;
  readonly eventFilePath: string;
  readonly streamFilePath: string;
  readonly streamEntry: string;
  readonly streamPath: ReadonlyArray<string | number> | undefined;
}) =>
  Effect.gen(function* () {
    const { fs, ui, eventFilePath, streamPath } = params;
    yield* fs.writeFileString(eventFilePath, `${JSON.stringify(params.eventData, null, 2)}\n`);
    yield* fs.writeFileString(params.streamFilePath, `${params.streamEntry}\n`, { flag: 'a' });
    yield* emitStreamLine(`event: ${eventFilePath}`, ui);
    if (streamPath !== undefined) {
      const streamValue = applyStreamPath(params.eventData, streamPath);
      yield* emitStreamLine(`stream: ${formatStreamValue(streamValue)}`, ui);
    }
  });

const formatStopMessage = (params: {
  matchingEvents: number;
  timedOut: boolean;
  temporaryTriggerDisabled: boolean;
}): string => {
  const eventLabel = `event${params.matchingEvents === 1 ? '' : 's'}`;
  if (params.timedOut) {
    return params.temporaryTriggerDisabled
      ? `Stopped after timeout with ${params.matchingEvents} matching ${eventLabel}. Temporary trigger disabled.`
      : `Stopped after timeout with ${params.matchingEvents} matching ${eventLabel}.`;
  }

  return params.temporaryTriggerDisabled
    ? `Stopped after receiving ${params.matchingEvents} ${eventLabel}. Temporary trigger disabled.`
    : `Stopped after receiving ${params.matchingEvents} ${eventLabel}.`;
};

const TIMEOUT_UNITS_MS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
};

const parseTimeoutMs = (value: string) =>
  Effect.gen(function* () {
    const trimmed = value.trim().toLowerCase();
    const match = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(trimmed);
    const amount = Number(match?.[1]);
    const unit = match?.[2];
    const unitMs = unit === undefined ? undefined : TIMEOUT_UNITS_MS[unit];
    if (!match || !Number.isFinite(amount) || amount <= 0 || unitMs === undefined) {
      return yield* Effect.fail(
        invalidOptionValue(
          'Invalid --timeout value. Use a duration such as "30s", "5m", "1hr", or "1day".',
          '--timeout'
        )
      );
    }

    return Math.round(amount * unitMs);
  });

const resolveListenSetup = (params: {
  readonly slug: string;
  readonly inputParams: Option.Option<string>;
  readonly timeout: Option.Option<string>;
  readonly stream: Option.Option<string>;
  readonly maxEvents: Option.Option<number>;
  readonly account: Option.Option<string>;
  readonly client: ComposioClientShape;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
  };
  readonly consumerUserId: string;
}) =>
  Effect.gen(function* () {
    const consumerUserId = params.consumerUserId;
    const listeningToProjectEvent = isProjectEventType(params.slug);
    const rawParams = Option.isSome(params.inputParams)
      ? (yield* resolveParamsInput(params.inputParams))?.trim() || '{}'
      : '{}';
    const createParamsInput = yield* Effect.fromResult(parseCreateParams(rawParams));
    yield* assertSupportedListenParams({
      listeningToProjectEvent,
      slug: params.slug,
      createParamsInput,
    });

    const resolvedConnectedAccountId = listeningToProjectEvent
      ? undefined
      : yield* resolveConnectedAccountIdForTrigger({
          client: params.client,
          slug: params.slug,
          consumerUserId,
          account: params.account,
          projectScope: {
            orgId: params.resolvedProject.orgId,
            projectId: params.resolvedProject.projectId,
          },
        });

    const createParams: TriggerCreateParams | undefined = listeningToProjectEvent
      ? undefined
      : {
          ...createParamsInput,
          connected_account_id: resolvedConnectedAccountId,
        };

    const timeoutMs = Option.isSome(params.timeout)
      ? yield* parseTimeoutMs(params.timeout.value)
      : undefined;
    const streamPath = Option.isSome(params.stream)
      ? yield* parseStreamPath(params.stream.value)
      : undefined;

    return {
      listeningToProjectEvent,
      createParams,
      timeoutMs,
      streamPath,
      shouldStream: Option.isSome(params.stream),
      maxEventsLimit: Option.getOrUndefined(params.maxEvents),
      consumerUserId,
    };
  });

export const listenCmd = Command.make(
  'listen',
  { slug, params, maxEvents, timeout, stream, account, failFast, debug },
  ({ slug, params, maxEvents, timeout, stream, account, failFast, debug }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const clientSingleton = yield* ComposioClientSingleton;
      const realtime = yield* TriggersRealtime;

      const { userId: actingUserId, project: resolvedProject } = yield* actingUser();

      const client = yield* clientSingleton.getFor({
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });
      const {
        listeningToProjectEvent,
        createParams,
        timeoutMs,
        streamPath,
        shouldStream,
        maxEventsLimit,
        consumerUserId,
      } = yield* resolveListenSetup({
        slug,
        inputParams: params,
        timeout,
        stream,
        maxEvents,
        account,
        client,
        resolvedProject,
        consumerUserId: actingUserId,
      });

      const artifactsOption = yield* resolveCliSessionArtifacts({
        orgId: resolvedProject.orgId,
        consumerUserId,
      });
      const artifactsRoot = Option.isSome(artifactsOption)
        ? artifactsOption.value.directoryPath
        : yield* resolveArtifactsRoot;
      const triggerDir = path.join(
        artifactsRoot,
        listeningToProjectEvent ? 'events' : 'triggers',
        sanitizePathPart(slug)
      );
      const streamFilePath = path.join(triggerDir, 'events.jsonl');

      yield* fs.makeDirectory(triggerDir, { recursive: true });
      yield* fs.writeFileString(streamFilePath, '', { flag: 'a' });

      const stopWhenDone = yield* Deferred.make<'max-events' | 'timeout' | 'failed'>();
      // Its own signal, so a --fail-fast failure also ends finishAcceptedEvents' wait.
      const failed = yield* Deferred.make<void>();
      let matchingEvents = 0;
      const writeFailures = makeSinkFailures({
        ui,
        failFast,
        stop: Effect.andThen(
          Deferred.succeed(failed, undefined),
          Deferred.succeed(stopWhenDone, 'failed')
        ).pipe(Effect.asVoid),
        summary: count => `${eventCount(count)} failed to write while listening.`,
      });
      const recordWriteFailure = (error: unknown) => writeFailures.record(errorMessage(error));
      const seenEventIds = new Set<string>();

      yield* Effect.acquireUseRelease(
        listeningToProjectEvent
          ? Effect.succeed<null | { trigger_id: string }>(null)
          : client.triggerInstances.upsert(slug, createParams).pipe(
              Effect.mapError(
                cause =>
                  new ListenCommandError({
                    reason: 'create_trigger',
                    message: `Failed to create temporary trigger "${slug}": Error: ${cause.message}`,
                    slug,
                    cause,
                  })
              ),
              // An active account for the inferred toolkit skips the lookup in
              // resolveConnectedAccountIdForTrigger, so a mistyped slug with a valid toolkit prefix
              // only surfaces here. The lookup's unknown_trigger failure replaces the create_trigger
              // error; any other outcome re-fails with the original error.
              Effect.catch(error =>
                assertTriggerTypeExists({ client, slug }).pipe(Effect.andThen(Effect.fail(error)))
              )
            ),
        createdTrigger =>
          Effect.gen(function* () {
            // Scoped below: a stop other than --max-events or --timeout interrupts the event
            // callbacks still running before the release hook sums up.
            const events = yield* FiberSet.make();
            const runEvent = yield* FiberSet.runtime(events)();
            yield* emitStreamLine(`listening for events ${slug} (tail at ${streamFilePath})`, ui);
            if (debug) {
              const debugMsg =
                createdTrigger === null
                  ? `[debug] event_type=${slug} project=${resolvedProject.projectId} org=${resolvedProject.orgId}`
                  : `[debug] trigger_id=${createdTrigger.trigger_id} project=${resolvedProject.projectId} org=${resolvedProject.orgId} createParams=${JSON.stringify(createParams)}`;
              yield* emitStreamLine(debugMsg, ui);
              if (createdTrigger !== null) {
                yield* emitStreamLine(
                  `[debug] upsert response: ${JSON.stringify(createdTrigger)}`,
                  ui
                );
              }
            }

            const onEvent = (eventData: Record<string, unknown>) => {
              runEvent(
                Effect.gen(function* () {
                  if (debug) {
                    yield* emitStreamLine(
                      `[debug] raw event keys: ${Object.keys(eventData).join(', ')}`,
                      ui
                    );
                    yield* emitStreamLine(
                      `[debug] raw event (truncated): ${JSON.stringify(eventData).slice(0, 500)}`,
                      ui
                    );
                  }
                  const parsedTriggerEvent =
                    createdTrigger === null ? undefined : parseTriggerListenEvent(eventData);
                  const filterResult =
                    createdTrigger === null
                      ? eventTypeOf(eventData) === slug
                      : parsedTriggerEvent !== undefined &&
                        matchesTriggerListenFilters(
                          { triggerId: createdTrigger.trigger_id },
                          parsedTriggerEvent
                        );
                  if (debug) {
                    yield* emitStreamLine(
                      createdTrigger === null
                        ? `[debug] event.type=${eventTypeOf(eventData) ?? '<missing>'} match=${filterResult}`
                        : `[debug] parsed.id=${parsedTriggerEvent?.id ?? '<missing>'} triggerSlug=${parsedTriggerEvent?.triggerSlug ?? '<missing>'} trigger_id=${createdTrigger.trigger_id} match=${filterResult}`,
                      ui
                    );
                  }
                  if (!filterResult) {
                    return;
                  }

                  const eventFileId = extractEventFileId(eventData);
                  if (seenEventIds.has(eventFileId)) {
                    if (debug) {
                      yield* emitStreamLine(`[debug] skipping duplicate event ${eventFileId}`, ui);
                    }
                    return;
                  }
                  seenEventIds.add(eventFileId);

                  matchingEvents += 1;
                  const eventFilePath = path.join(triggerDir, `${eventFileId}-payload.json`);
                  const streamEntry = JSON.stringify({
                    event_id: eventFileId,
                    event_type: eventTypeOf(eventData),
                    trigger_id: createdTrigger?.trigger_id,
                    trigger_slug: createdTrigger ? slug : undefined,
                    file_path: eventFilePath,
                    received_at: new Date().toISOString(),
                  });

                  // A matched event counts toward --max-events even when saving it fails.
                  yield* saveListenEvent({
                    fs,
                    ui,
                    eventData,
                    eventFilePath,
                    streamFilePath,
                    streamEntry,
                    streamPath: shouldStream ? (streamPath ?? []) : undefined,
                  }).pipe(Effect.catch(recordWriteFailure));

                  if (maxEventsLimit !== undefined && matchingEvents >= maxEventsLimit) {
                    yield* Deferred.succeed(stopWhenDone, 'max-events').pipe(Effect.ignore);
                  }
                }).pipe(Effect.catch(recordWriteFailure))
              );
            };

            const listenEffect = realtime
              .listenInProject(
                {
                  orgId: resolvedProject.orgId,
                  projectId: resolvedProject.projectId,
                },
                onEvent
              )
              .pipe(Effect.onInterrupt(() => ui.log.info(`Stopped listening for events ${slug}.`)));

            if (timeoutMs !== undefined) {
              yield* Effect.forkScoped(
                Effect.sleep(timeoutMs).pipe(
                  Effect.andThen(Deferred.succeed(stopWhenDone, 'timeout')),
                  Effect.ignore
                )
              );
            }

            // Without --max-events, --timeout or --fail-fast nothing resolves stopWhenDone, so
            // this waits on the listener until it is interrupted.
            const stopReason = yield* Effect.raceFirst(listenEffect, Deferred.await(stopWhenDone));
            if (stopReason === 'max-events' || stopReason === 'timeout') {
              yield* finishAcceptedEvents(events, failed);
            }
            if (stopReason === 'max-events') {
              yield* ui.outro(
                formatStopMessage({
                  matchingEvents,
                  timedOut: false,
                  temporaryTriggerDisabled: createdTrigger !== null,
                })
              );
              return;
            }

            if (stopReason === 'timeout') {
              yield* ui.outro(
                formatStopMessage({
                  matchingEvents,
                  timedOut: true,
                  temporaryTriggerDisabled: createdTrigger !== null,
                })
              );
            }
          }).pipe(Effect.scoped),
        created =>
          Effect.gen(function* () {
            if (created !== null) {
              yield* disableTemporaryTrigger({ client, ui, slug, triggerId: created.trigger_id });
            }
            // Runs on every stop of the use phase — max-events, timeout, --fail-fast, and the
            // interruption by Ctrl+C or SIGTERM — so a piped caller always gets the count.
            yield* writeFailures.report;
          })
      ).pipe(
        Effect.catchTag('services/TriggerRealtimeSubscriptionError', error =>
          reportFailure(
            ui,
            `Could not subscribe to realtime trigger events: ${error.message}. Check your network connection or run \`composio login\`.`
          )
        )
      );
    })
).pipe(
  Command.withDescription(
    'Listen to consumer-project realtime events. Trigger slugs create a temporary trigger; top-level composio.* event types subscribe directly.'
  ),
  Command.withExamples([
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --max-events 5',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE --account work --timeout 5m',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE --max-events 5 --fail-fast',
    },
    {
      command: "composio listen GMAIL_NEW_GMAIL_MESSAGE --timeout 1hr --stream '.data.threadId'",
    },
    {
      command:
        'composio listen SLACK_CHANNEL_MESSAGE_RECEIVED -p \'{ trigger_config: { channel_id: "C123" } }\'',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --stream',
    },
    {
      command: "composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --stream '.data.threadId'",
    },
  ]),
  requireLogin
);
