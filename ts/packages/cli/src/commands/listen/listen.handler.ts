import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { ComposioClientShape } from '@composio/client/effect';
import { Deferred, Effect, FiberSet, Option, Predicate } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { actingUser } from 'src/commands/surface';
import { matchesTriggerListenFilters } from 'src/commands/triggers/filter';
import { parseTriggerListenEvent } from 'src/commands/triggers/parse';
import {
  eventCount,
  finishAcceptedEvents,
  makeSinkFailures,
} from 'src/commands/triggers/sink-failures';
import { reportFailure } from 'src/effects/report-failure';
import { resolveOptionalTextInput } from 'src/effects/resolve-optional-text-input';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import {
  resolveArtifactsRoot,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { ComposioClientSingleton, type ToolkitProjectScope } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { resolveConnectedAccountForToolkit } from 'src/services/connected-account-selection';
import { LISTENER_STOP, ShutdownSignal } from 'src/services/shutdown-signal';
import { TerminalUI } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import { ListenCommandError } from './listen.errors';
import { emitStreamLine, formatStopMessage, formatStreamValue } from './listen.format';
import {
  applyStreamPath,
  parseCreateParams,
  parseStreamPath,
  parseTimeoutMs,
} from './listen.parse';

type TriggerCreateParams = NonNullable<
  Parameters<ComposioClientShape['triggerInstances']['upsert']>[1]
>;

export type ListenParams = {
  readonly slug: string;
  readonly params: Option.Option<string>;
  readonly maxEvents: Option.Option<number>;
  readonly timeout: Option.Option<string>;
  readonly stream: Option.Option<string>;
  readonly account: Option.Option<string>;
  readonly failFast: boolean;
  readonly debug: boolean;
};

const invalidOptionValue = commandInputError('listen');

const errorMessage = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

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

/**
 * Creates the directory that holds one payload file per matched event, and its `events.jsonl`
 * stream file.
 */
const prepareListenEventFiles = (params: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly orgId: string;
  readonly consumerUserId: string;
  readonly slug: string;
  readonly listeningToProjectEvent: boolean;
}) =>
  Effect.gen(function* () {
    const { fs, path, slug } = params;
    const artifactsOption = yield* resolveCliSessionArtifacts({
      orgId: params.orgId,
      consumerUserId: params.consumerUserId,
    });
    const artifactsRoot = Option.isSome(artifactsOption)
      ? artifactsOption.value.directoryPath
      : yield* resolveArtifactsRoot;
    const triggerDir = path.join(
      artifactsRoot,
      params.listeningToProjectEvent ? 'events' : 'triggers',
      sanitizePathPart(slug)
    );
    const streamFilePath = path.join(triggerDir, 'events.jsonl');

    yield* fs.makeDirectory(triggerDir, { recursive: true });
    yield* fs.writeFileString(streamFilePath, '', { flag: 'a' });
    return { triggerDir, streamFilePath };
  });

export const runListen = (input: ListenParams) =>
  Effect.gen(function* () {
    const { slug, params, maxEvents, timeout, stream, account, failFast, debug } = input;
    const ui = yield* TerminalUI;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const clientSingleton = yield* ComposioClientSingleton;
    const realtime = yield* TriggersRealtime;
    const shutdown = yield* ShutdownSignal;

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

    const { triggerDir, streamFilePath } = yield* prepareListenEventFiles({
      fs,
      path,
      orgId: resolvedProject.orgId,
      consumerUserId,
      slug,
      listeningToProjectEvent,
    });

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
              { orgId: resolvedProject.orgId, projectId: resolvedProject.projectId },
              onEvent,
              { onSubscribed: shutdown.cooperate(LISTENER_STOP) }
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

          // Ctrl-C or SIGTERM after the subscription is a clean stop: exit 0 after the release.
          const stopReason = yield* Effect.raceAllFirst([
            listenEffect,
            Deferred.await(stopWhenDone),
            Effect.as(shutdown.requested, 'signal' as const),
          ]);
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
          // Runs on every stop of the use phase — max-events, timeout, --fail-fast, Ctrl+C or
          // SIGTERM, and an interruption — so a piped caller always gets the count.
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
  });
