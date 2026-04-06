import { Args, Command, Options } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { Deferred, Effect, Option, Runtime } from 'effect';
import path from 'node:path';
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
import { parseJsonIsh } from 'src/utils/parse-json-ish';
import { toolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';
import { matchesTriggerListenFilters } from './triggers/filter';
import { parseTriggerListenEvent } from './triggers/parse';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")')
);

const params = Options.text('params').pipe(
  Options.withAlias('p'),
  Options.withDescription('Trigger create params as JSON/JS object, @file, or - for stdin'),
  Options.optional
);

const maxEvents = Options.integer('max-events').pipe(
  Options.withDescription('Stop after receiving N events for this temporary trigger'),
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

const debug = Options.boolean('debug').pipe(
  Options.withDescription(
    'Print verbose debug information (raw events, filter results, Pusher state)'
  ),
  Options.withDefault(false)
);

const sanitizePathPart = (value: string): string =>
  value.replace(/[^A-Z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown';

const resolveParamsInput = (input: Option.Option<string>) =>
  resolveOptionalTextInput(input, { missingValue: '{}' });

const parseCreateParams = (raw: string) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => parseJsonIsh(raw),
      catch: () =>
        new Error(
          "Invalid --params input. Provide JSON or a JS-style object literal, e.g. -p '{ trigger_config: { ... } }'."
        ),
    });

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return yield* Effect.fail(
        new Error("Expected --params to be an object, e.g. -p '{ trigger_config: { ... } }'.")
      );
    }

    return parsed as Record<string, unknown>;
  });

const selectConnectedAccountId = (
  items: ReadonlyArray<{
    id: string;
    updated_at: string;
    is_disabled: boolean;
  }>
): string | undefined => {
  const active = items.filter(item => !item.is_disabled);
  if (active.length === 0) {
    return undefined;
  }

  return [...active]
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .at(0)?.id;
};

const emitStreamLine = (line: string, ui: TerminalUI) =>
  Effect.gen(function* () {
    yield* ui.log.message(line);
    yield* ui.output(line, { force: true });
  });

const extractEventFileId = (eventData: Record<string, unknown>): string => {
  const candidates = [
    eventData.id,
    eventData.log_id,
    typeof eventData.metadata === 'object' && eventData.metadata !== null
      ? (eventData.metadata as Record<string, unknown>).id
      : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return sanitizePathPart(candidate);
    }
  }

  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
};

const resolveFallbackArtifactsDir = () => resolveArtifactsRoot();

const parseStreamPath = (expression: string): ReadonlyArray<string | number> => {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('.')) {
    throw new Error('Expected --stream to contain a jq-like path starting with "."');
  }

  const pathTokens: Array<string | number> = [];
  const tokenPattern = /(?:\.([A-Za-z0-9_-]+))|(?:\[(\d+)\])/g;
  let lastIndex = 0;

  for (const match of trimmed.matchAll(tokenPattern)) {
    if ((match.index ?? -1) !== lastIndex) {
      throw new Error(
        'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".'
      );
    }

    if (match[1]) pathTokens.push(match[1]);
    if (match[2]) pathTokens.push(Number(match[2]));
    lastIndex += match[0].length;
  }

  if (lastIndex !== trimmed.length) {
    throw new Error(
      'Unsupported --stream expression. Use a jq-like path such as ".foo.bar" or ".items[0].id".'
    );
  }

  return pathTokens;
};

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

    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[token];
  }

  return current;
};

const formatStreamValue = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
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

const parseTimeoutMs = (value: string): number => {
  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(trimmed);
  if (!match) {
    throw new Error(
      'Invalid --timeout value. Use a duration such as "30s", "5m", "1hr", or "1day".'
    );
  }

  const amount = Number(match[1]);
  const unitMs = TIMEOUT_UNITS_MS[match[2]];
  if (!Number.isFinite(amount) || amount <= 0 || unitMs === undefined) {
    throw new Error(
      'Invalid --timeout value. Use a duration such as "30s", "5m", "1hr", or "1day".'
    );
  }

  return Math.round(amount * unitMs);
};

export const listenCmd = Command.make(
  'listen',
  { slug, params, maxEvents, timeout, stream, debug },
  ({ slug, params, maxEvents, timeout, stream, debug }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const fs = yield* FileSystem.FileSystem;
      const runtime = yield* Effect.runtime<never>();
      const clientSingleton = yield* ComposioClientSingleton;
      const realtime = yield* TriggersRealtime;

      const resolvedProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
        Effect.mapError(formatResolveCommandProjectError)
      );

      const client = yield* clientSingleton.getFor({
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });

      if (!resolvedProject.consumerUserId) {
        return yield* Effect.fail(
          new Error('No consumer user is available in the current project context.')
        );
      }

      const rawParams = Option.isSome(params)
        ? (yield* resolveParamsInput(params))?.trim() || '{}'
        : '{}';
      const createParamsInput = yield* parseCreateParams(rawParams);
      const toolkitSlug = toolkitFromToolSlug(slug);
      if (!toolkitSlug) {
        return yield* Effect.fail(
          new Error(
            `Could not infer a toolkit from trigger slug "${slug}". Use a standard trigger slug such as "GMAIL_NEW_GMAIL_MESSAGE".`
          )
        );
      }

      const connectedAccounts = yield* Effect.tryPromise({
        try: () =>
          client.connectedAccounts.list({
            toolkit_slugs: [toolkitSlug],
            user_ids: resolvedProject.consumerUserId ? [resolvedProject.consumerUserId] : undefined,
            statuses: ['ACTIVE'],
            limit: 100,
          }),
        catch: error =>
          new Error(`Failed to list connected accounts for "${toolkitSlug}": ${String(error)}`),
      });
      const resolvedConnectedAccountId = selectConnectedAccountId(connectedAccounts.items);

      if (!resolvedConnectedAccountId) {
        return yield* Effect.fail(
          new Error(
            `No active connected account found for toolkit "${toolkitSlug}" and consumer user "${resolvedProject.consumerUserId}". Run \`composio link ${toolkitSlug}\` first.`
          )
        );
      }

      const createParams = {
        ...createParamsInput,
        connected_account_id: resolvedConnectedAccountId,
      } as Parameters<typeof client.triggerInstances.upsert>[1];
      const timeoutMs = Option.match(timeout, {
        onNone: () => undefined,
        onSome: value => parseTimeoutMs(value),
      });
      const streamPath = Option.match(stream, {
        onNone: () => undefined,
        onSome: value => {
          const trimmed = value.trim();
          return trimmed.length === 0 ? [] : parseStreamPath(trimmed);
        },
      });
      const shouldStream = Option.isSome(stream);

      const artifactsOption = yield* resolveCliSessionArtifacts({
        orgId: resolvedProject.orgId,
        consumerUserId: resolvedProject.consumerUserId,
      });
      const artifactsRoot = Option.match(artifactsOption, {
        onNone: () => resolveFallbackArtifactsDir(),
        onSome: value => value.directoryPath,
      });
      const triggerDir = path.join(artifactsRoot, 'triggers', sanitizePathPart(slug));
      const streamFilePath = path.join(triggerDir, 'events.jsonl');

      yield* fs.makeDirectory(triggerDir, { recursive: true });
      yield* fs.writeFileString(streamFilePath, '', { flag: 'a' });

      const maxEventsLimit = Option.getOrUndefined(maxEvents);
      const stopWhenDone = yield* Deferred.make<'max-events' | 'timeout'>();
      let matchingEvents = 0;
      const seenEventIds = new Set<string>();

      yield* Effect.acquireUseRelease(
        Effect.tryPromise({
          try: () => client.triggerInstances.upsert(slug, createParams),
          catch: error =>
            new Error(`Failed to create temporary trigger "${slug}": ${String(error)}`),
        }),
        createdTrigger =>
          Effect.gen(function* () {
            yield* emitStreamLine(`listening for events ${slug} (tail at ${streamFilePath})`, ui);
            if (debug) {
              const debugMsg = `[debug] trigger_id=${createdTrigger.trigger_id} project=${resolvedProject.projectId} org=${resolvedProject.orgId} createParams=${JSON.stringify(createParams)}`;
              yield* emitStreamLine(debugMsg, ui);
              yield* emitStreamLine(
                `[debug] upsert response: ${JSON.stringify(createdTrigger)}`,
                ui
              );
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
                  const parsed = parseTriggerListenEvent(eventData);
                  const filterResult = matchesTriggerListenFilters(
                    { triggerId: createdTrigger.trigger_id },
                    parsed
                  );
                  if (debug) {
                    yield* emitStreamLine(
                      `[debug] parsed.id=${parsed.id} triggerSlug=${parsed.triggerSlug} trigger_id=${createdTrigger.trigger_id} match=${filterResult}`,
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
                    trigger_id: createdTrigger.trigger_id,
                    trigger_slug: slug,
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
                  Effect.catchAll(error =>
                    ui.log.warn(error instanceof Error ? error.message : String(error))
                  )
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
                `Stopped after receiving ${matchingEvents} events. Temporary trigger disabled.`
              );
              return;
            }

            if (stopReason === 'timeout') {
              yield* ui.outro(
                `Stopped after timeout with ${matchingEvents} matching event${matchingEvents === 1 ? '' : 's'}. Temporary trigger disabled.`
              );
            }
          }),
        created =>
          Effect.tryPromise({
            try: () =>
              client.triggerInstances.manage.update(created.trigger_id, { status: 'disable' }),
            catch: error =>
              new Error(
                `Failed to disable temporary trigger "${created.trigger_id}": ${String(error)}`
              ),
          }).pipe(
            Effect.catchAll(error =>
              ui.log.warn(error instanceof Error ? error.message : String(error))
            )
          )
      );
    })
).pipe(
  Command.withDescription(
    'Create a temporary subscription for consumer-project events and write each event to artifacts for easy background-agent consumption.'
  )
);
