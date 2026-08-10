import { Args, Command, HelpDoc, Options, ValidationError } from '@effect/cli';
import { FileSystem, Path } from '@effect/platform';
import type { Composio as RawComposioClient } from '@composio/client';
import { Data, Deferred, Effect, Either, Option, Predicate, Runtime } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { resolveOptionalTextInput } from 'src/effects/resolve-optional-text-input';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import {
  resolveArtifactsRoot,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';
import { TerminalUI } from 'src/services/terminal-ui';
import { TriggersRealtime } from 'src/services/triggers-realtime';
import {
  formatConnectedAccountChoices,
  resolveConnectedAccountSelection,
} from 'src/services/connected-account-selection';
import { parseJsonRecord } from 'src/utils/parse-json';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import { matchesTriggerListenFilters } from './triggers/filter';
import { parseTriggerListenEvent } from './triggers/parse';
import { decodeConnectedAccountItems } from 'src/effects/decode-connected-account-list';

type TriggerCreateParams = NonNullable<
  Parameters<RawComposioClient['triggerInstances']['upsert']>[1]
>;

export class ListenCommandError extends Data.TaggedError('commands/ListenCommandError')<{
  readonly reason:
    | 'project_context'
    | 'connected_accounts'
    | 'connected_account_not_found'
    | 'create_trigger'
    | 'disable_trigger';
  readonly message: string;
  readonly slug?: string;
  readonly toolkitSlug?: string;
  readonly cause?: unknown;
}> {}

const invalidOptionValue = (message: string) => ValidationError.invalidValue(HelpDoc.p(message));

const errorMessage = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription(
    'Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE") or project event type (e.g. "composio.connected_account.expired")'
  )
);

const params = Options.text('params').pipe(
  Options.withAlias('p'),
  Options.withDescription(
    'Trigger create params as JSON/JS object, @file, or - for stdin. Only valid for trigger slugs.'
  ),
  Options.optional
);

const maxEvents = Options.integer('max-events').pipe(
  Options.withDescription('Stop after receiving N matching events'),
  Options.optional
);

const timeout = Options.text('timeout').pipe(
  Options.withDescription('Stop after a duration such as "5m", "1hr", or "30s"'),
  Options.optional
);

const stream = Options.text('stream').pipe(
  Options.withDescription(
    'Also stream each event payload inline. Pass an optional jq-like path such as ".thread.id" or ".data[0].id".'
  ),
  Options.optional
);
const account = Options.text('account').pipe(
  Options.withDescription(
    'Connected account selector. Matches alias, word_id, or connected account id for the inferred toolkit.'
  ),
  Options.optional
);

const debug = Options.boolean('debug').pipe(
  Options.withDescription(
    'Print verbose debug information (raw events, filter results, Pusher state)'
  ),
  Options.withDefault(false)
);

const sanitizePathPart = (value: string): string =>
  value.replace(/[^A-Z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown';

const disableTemporaryTrigger = (params: {
  client: RawComposioClient;
  ui: TerminalUI;
  slug: string;
  triggerId: string;
}) =>
  Effect.tryPromise({
    try: () =>
      params.client.triggerInstances.manage.update(params.triggerId, { status: 'disable' }),
    catch: cause =>
      new ListenCommandError({
        reason: 'disable_trigger',
        message: `Failed to disable temporary trigger "${params.triggerId}": ${String(cause)}`,
        slug: params.slug,
        cause,
      }),
  }).pipe(
    Effect.tapError(error => params.ui.log.warn(error.message)),
    Effect.ignore
  );

const isProjectEventType = (value: string): boolean => value.startsWith('composio.');

const resolveParamsInput = (input: Option.Option<string>) =>
  resolveOptionalTextInput(input, { missingValue: '{}' });

const parseCreateParams = (raw: string) =>
  parseJsonRecord(raw).pipe(
    Either.mapLeft(error =>
      invalidOptionValue(
        error.reason === 'not-a-record'
          ? "Expected --params to be an object, e.g. -p '{ trigger_config: { ... } }'."
          : "Invalid --params input. Provide JSON or a JS-style object literal, e.g. -p '{ trigger_config: { ... } }'."
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
          `--params is only supported for trigger slugs. "${params.slug}" is a project-level composio.* event type and does not create a temporary trigger.`
        )
      )
    : Effect.void;

const resolveConnectedAccountIdForTrigger = (params: {
  client: RawComposioClient;
  slug: string;
  consumerUserId: string;
  account: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const toolkitSlug = yield* toolkitFromToolSlug(params.slug);
    if (!toolkitSlug) {
      return yield* Effect.fail(
        invalidOptionValue(
          `Could not infer a toolkit from trigger slug "${params.slug}". Use a standard trigger slug such as "GMAIL_NEW_GMAIL_MESSAGE", or a project event type such as "composio.connected_account.expired".`
        )
      );
    }

    const connectedAccounts = yield* Effect.tryPromise({
      try: () =>
        params.client.connectedAccounts.list({
          toolkit_slugs: [toolkitSlug],
          user_ids: [params.consumerUserId],
          statuses: ['ACTIVE'],
          limit: 100,
        }),
      catch: cause =>
        new ListenCommandError({
          reason: 'connected_accounts',
          message: `Failed to list connected accounts for "${toolkitSlug}": ${String(cause)}`,
          slug: params.slug,
          toolkitSlug,
          cause,
        }),
    });
    const selectableAccounts = yield* decodeConnectedAccountItems(connectedAccounts.items).pipe(
      Effect.mapError(
        cause =>
          new ListenCommandError({
            reason: 'connected_accounts',
            message: `Connected accounts for toolkit "${toolkitSlug}" did not match the expected response shape.`,
            slug: params.slug,
            toolkitSlug,
            cause,
          })
      )
    );
    const selectedAccount = resolveConnectedAccountSelection(
      selectableAccounts,
      Option.getOrUndefined(params.account)
    );
    if (selectedAccount?.id) {
      return selectedAccount.id;
    }

    const choices = formatConnectedAccountChoices(selectableAccounts);
    const suffix =
      Option.isSome(params.account) && choices.length > 0
        ? ` Available accounts: ${choices.join(', ')}.`
        : '';
    return yield* new ListenCommandError({
      reason: 'connected_account_not_found',
      message: Option.isSome(params.account)
        ? `No connected account matched "${params.account.value}" for toolkit "${toolkitSlug}" and consumer user "${params.consumerUserId}".${suffix}`
        : `No active connected account found for toolkit "${toolkitSlug}" and consumer user "${params.consumerUserId}". Run \`composio link ${toolkitSlug}\` first.`,
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
  const metadata = Predicate.isRecord(eventData.metadata) ? eventData.metadata : undefined;
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
    if (!trimmed.startsWith('.')) {
      return yield* Effect.fail(
        invalidOptionValue('Expected --stream to contain a jq-like path starting with "."')
      );
    }

    const pathTokens: Array<string | number> = [];
    const tokenPattern = /(?:\.([A-Za-z0-9_-]+))|(?:\[(\d+)\])/g;
    let lastIndex = 0;

    for (const match of trimmed.matchAll(tokenPattern)) {
      if ((match.index ?? -1) !== lastIndex) {
        return yield* Effect.fail(
          invalidOptionValue(
            'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".'
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
          'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".'
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

    if (!Predicate.isRecord(current)) {
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
          'Invalid --timeout value. Use a duration such as "30s", "5m", "1hr", or "1day".'
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
  readonly client: RawComposioClient;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
    readonly consumerUserId?: string;
  };
}) =>
  Effect.gen(function* () {
    const consumerUserId = params.resolvedProject.consumerUserId;
    if (!consumerUserId) {
      return yield* new ListenCommandError({
        reason: 'project_context',
        message: 'No consumer user is available in the current project context.',
        slug: params.slug,
      });
    }

    const listeningToProjectEvent = isProjectEventType(params.slug);
    const rawParams = Option.isSome(params.inputParams)
      ? (yield* resolveParamsInput(params.inputParams))?.trim() || '{}'
      : '{}';
    const createParamsInput = yield* parseCreateParams(rawParams);
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
      ? params.stream.value.trim().length === 0
        ? []
        : yield* parseStreamPath(params.stream.value)
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
  { slug, params, maxEvents, timeout, stream, account, debug },
  ({ slug, params, maxEvents, timeout, stream, account, debug }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const runtime = yield* Effect.runtime<never>();
      const clientSingleton = yield* ComposioClientSingleton;
      const realtime = yield* TriggersRealtime;

      const resolvedProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
        Effect.mapError(cause => {
          const formatted = formatResolveCommandProjectError(cause);
          return new ListenCommandError({
            reason: 'project_context',
            message: formatted.message,
            slug,
            cause,
          });
        })
      );

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

      const stopWhenDone = yield* Deferred.make<'max-events' | 'timeout'>();
      let matchingEvents = 0;
      const seenEventIds = new Set<string>();

      yield* Effect.acquireUseRelease(
        listeningToProjectEvent
          ? Effect.succeed<null | { trigger_id: string }>(null)
          : Effect.tryPromise({
              try: () => client.triggerInstances.upsert(slug, createParams),
              catch: cause =>
                new ListenCommandError({
                  reason: 'create_trigger',
                  message: `Failed to create temporary trigger "${slug}": ${String(cause)}`,
                  slug,
                  cause,
                }),
            }),
        createdTrigger =>
          Effect.gen(function* () {
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
              Runtime.runFork(runtime)(
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
                  const eventJson = JSON.stringify(eventData, null, 2);
                  const streamEntry = JSON.stringify({
                    event_id: eventFileId,
                    event_type: eventTypeOf(eventData),
                    trigger_id: createdTrigger?.trigger_id,
                    trigger_slug: createdTrigger ? slug : undefined,
                    file_path: eventFilePath,
                    received_at: new Date().toISOString(),
                  });

                  yield* fs.writeFileString(eventFilePath, `${eventJson}\n`);
                  yield* fs.writeFileString(streamFilePath, `${streamEntry}\n`, { flag: 'a' });
                  yield* emitStreamLine(`event: ${eventFilePath}`, ui);

                  if (shouldStream) {
                    const streamValue =
                      streamPath === undefined
                        ? eventData
                        : streamPath.length === 0
                          ? eventData
                          : applyStreamPath(eventData, streamPath);
                    yield* emitStreamLine(`stream: ${formatStreamValue(streamValue)}`, ui);
                  }

                  if (maxEventsLimit !== undefined && matchingEvents >= maxEventsLimit) {
                    yield* Deferred.succeed(stopWhenDone, 'max-events').pipe(Effect.ignore);
                  }
                }).pipe(
                  Effect.tapError(error => ui.log.warn(errorMessage(error))),
                  Effect.ignore
                )
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

            if (maxEventsLimit === undefined && timeoutMs === undefined) {
              yield* listenEffect;
              return;
            }

            const stopReason = yield* Effect.raceFirst(listenEffect, Deferred.await(stopWhenDone));
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
          }),
        created =>
          created === null
            ? Effect.void
            : disableTemporaryTrigger({ client, ui, slug, triggerId: created.trigger_id })
      ).pipe(
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
    'Listen to consumer-project realtime events. Trigger slugs create a temporary trigger; top-level composio.* event types subscribe directly.'
  )
);
