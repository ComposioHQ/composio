import process from 'node:process';
import { FileSystem, HttpClient, HttpClientRequest, Path } from '@effect/platform';
import {
  Cause,
  Clock,
  Config,
  ConfigProvider,
  DateTime,
  Effect,
  Encoding,
  Option,
  Schema,
} from 'effect';
import * as constants from 'src/constants';
import { spawnDetached } from 'src/services/detached-process';
import { djb2Hash } from 'src/utils/djb2';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import type { AnalyticsEnvelope, TrackEvent } from './types';

const INTERNAL_ANALYTICS_WORKER_FLAG = '__analytics-worker';
const INTERNAL_CODACT_FAILURE_WORKER_FLAG = '__codact-failure-worker';
const COMPOSIO_DIR = '.composio';
const ANALYTICS_STATE_FILE_NAME = 'analytics.json';
const CONSUMER_SHORT_TERM_CACHE_FILE_NAME = 'consumer-short-term-cache.json';
const CLI_CODACT_FAILURES_PATH = '/api/v3/cli/codact_failures';

// PostHog's single-event capture endpoint expects `$create_alias` to merge an
// anonymous person into an identified one (`properties.alias` -> `distinct_id`).
const POSTHOG_ALIAS_EVENT = '$create_alias';
const POSTHOG_LIB = 'composio-cli';

export type CliCodactFailureType = 'wrong_tool_slug' | 'wrong_tool_input_param';

export type CliCodactFailureToolInfo = {
  readonly toolkit?: string;
  readonly tool?: {
    readonly slug: string;
    readonly version: string;
  };
};

export type CliCodactFailure = {
  readonly failureType: CliCodactFailureType;
  readonly toolInfo?: CliCodactFailureToolInfo;
  readonly ctx: Record<string, unknown>;
  readonly session?: Record<string, unknown>;
  readonly requestId?: string;
};

type ConsumerShortTermCacheState = Record<
  string,
  {
    readonly probablyMyCliSessionsByCwdHash?: Record<
      string,
      {
        readonly id: string;
        readonly expiresAt: string;
      }
    >;
  }
>;

// Workers start before the CLI's prefixed ConfigProvider is assembled, so this
// module names and reads the actual environment variables from a raw provider.
const environmentProvider = ConfigProvider.fromEnv();
const optionalString = (name: string) => Config.option(Config.string(name));
const booleanWithDefault = (name: string) => Config.boolean(name).pipe(Config.withDefault(false));
const configuredString = (value: Option.Option<string>): string | undefined =>
  value.pipe(
    Option.map(value => value.trim()),
    Option.filter(value => value.length > 0),
    Option.getOrUndefined
  );

const telemetryDebugEnabled = environmentProvider.load(
  booleanWithDefault('COMPOSIO_CLI_TELEMETRY_DEBUG')
);

const analyticsDisabled = environmentProvider.load(
  Config.all({
    cliTelemetryDisabled: booleanWithDefault('COMPOSIO_CLI_TELEMETRY_DISABLED'),
    telemetryDisabled: booleanWithDefault('TELEMETRY_DISABLED'),
    composioTelemetryDisabled: booleanWithDefault('COMPOSIO_DISABLE_TELEMETRY'),
    nodeEnvironment: Config.string('NODE_ENV').pipe(Config.withDefault('')),
    ci: booleanWithDefault('CI'),
  }).pipe(
    Config.map(
      ({
        cliTelemetryDisabled,
        telemetryDisabled,
        composioTelemetryDisabled,
        nodeEnvironment,
        ci,
      }) =>
        cliTelemetryDisabled ||
        telemetryDisabled ||
        composioTelemetryDisabled ||
        nodeEnvironment === 'test' ||
        ci
    )
  )
);

// Resolves the direct-to-PostHog transport target. Both fields fall back to the
// embedded constants; env overrides exist for tests and staging. Crucially this
// does NOT depend on the Composio API base URL (which is only written at login),
// so pre-login install/setup events can be delivered.
const getPostHogConfig = environmentProvider
  .load(
    Config.all({
      ingestUrl: optionalString('COMPOSIO_POSTHOG_INGEST_URL'),
      projectKey: optionalString('COMPOSIO_POSTHOG_KEY'),
    })
  )
  .pipe(
    Effect.map(({ ingestUrl, projectKey }) => ({
      ingestUrl: configuredString(ingestUrl) ?? constants.COMPOSIO_POSTHOG_INGEST_URL,
      projectKey: configuredString(projectKey) ?? constants.COMPOSIO_POSTHOG_PROJECT_KEY,
    }))
  );

const jsonFromString = Schema.parseJson();
const prettyJsonFromString = Schema.parseJson({ space: 2 });
const decodeJson = Schema.decodeUnknown(jsonFromString);
const encodeJson = Schema.encode(jsonFromString);
const encodePrettyJson = Schema.encode(prettyJsonFromString);

const telemetryDebugLog = (label: string, payload: Record<string, unknown>) =>
  Effect.gen(function* () {
    if (!(yield* telemetryDebugEnabled)) {
      return;
    }

    const body = yield* encodePrettyJson({ label, ...payload });
    const ui = yield* TerminalUI;
    yield* ui.error(`[telemetry-debug] ${body}`);
  }).pipe(Effect.ignore);

const telemetryErrorDetails = (cause: Cause.Cause<unknown>): Record<string, string> => {
  const squashed = Cause.squash(cause);
  const error = Cause.isUnknownException(squashed) ? squashed.error : squashed;
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error) };
};

const getAnalyticsPaths = Effect.gen(function* () {
  const path = yield* Path.Path;
  const os = yield* NodeOs;
  const cacheDirectories = yield* environmentProvider.load(
    Config.all({
      composio: optionalString('COMPOSIO_CACHE_DIR'),
      legacy: optionalString('CACHE_DIR'),
    })
  );
  const analyticsDir = path.join(os.homedir, COMPOSIO_DIR);
  const cacheDir =
    configuredString(cacheDirectories.composio) ??
    configuredString(cacheDirectories.legacy) ??
    path.join(os.homedir, constants.USER_COMPOSIO_DIR);

  return {
    analyticsDir,
    analyticsStatePath: path.join(analyticsDir, ANALYTICS_STATE_FILE_NAME),
    userConfigPath: path.join(analyticsDir, constants.USER_CONFIG_FILE_NAME),
    consumerShortTermCachePath: path.join(cacheDir, CONSUMER_SHORT_TERM_CACHE_FILE_NAME),
  };
});

const readOptionalJson = <A>(filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(filePath, 'utf8');
    return (yield* decodeJson(raw)) as A;
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

// Persisted `~/.composio/analytics.json`. `install_id` is the anonymous device
// UUID; `apollo_user_id` (the Apollo `org_member.id`, persisted at login) becomes
// the PostHog identity so CLI events join the same person as web onboarding.
type AnalyticsState = {
  readonly install_id?: string;
  readonly apollo_user_id?: string;
  readonly created_at?: string;
};

const makeInstallId = Effect.sync(() => crypto.randomUUID());

const readAnalyticsState = Effect.gen(function* () {
  const paths = yield* getAnalyticsPaths;
  return yield* readOptionalJson<AnalyticsState>(paths.analyticsStatePath);
});

const getOrCreateInstallId = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* getAnalyticsPaths;

  yield* fs
    .makeDirectory(paths.analyticsDir, { recursive: true })
    .pipe(Effect.catchAll(() => Effect.void));

  const state = yield* readOptionalJson<AnalyticsState>(paths.analyticsStatePath);
  if (typeof state?.install_id === 'string' && state.install_id.length > 0) {
    return state.install_id;
  }

  const installId = yield* makeInstallId;
  const createdAt = DateTime.formatIso(yield* DateTime.now);
  const contents = yield* encodeJson({
    ...(state ?? {}),
    install_id: installId,
    created_at: createdAt,
  });
  yield* fs.writeFileString(paths.analyticsStatePath, contents);
  return installId;
}).pipe(Effect.catchAll(() => makeInstallId));

const readApolloUserId = Effect.map(readAnalyticsState, state =>
  typeof state?.apollo_user_id === 'string' && state.apollo_user_id.length > 0
    ? state.apollo_user_id
    : null
);

// Persists the Apollo `org_member.id` into the analytics state, preserving the
// existing `install_id`/`created_at` so the anonymous device identity is kept
// for the login-time alias. Best-effort: never surfaces or throws.
const persistApolloUserId = (installId: string, apolloUserId: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* getAnalyticsPaths;

    yield* fs
      .makeDirectory(paths.analyticsDir, { recursive: true })
      .pipe(Effect.catchAll(() => Effect.void));

    const state = yield* readOptionalJson<AnalyticsState>(paths.analyticsStatePath);
    const createdAt = state?.created_at ?? DateTime.formatIso(yield* DateTime.now);
    const contents = yield* encodeJson({
      ...(state ?? {}),
      install_id: state?.install_id ?? installId,
      apollo_user_id: apolloUserId,
      created_at: createdAt,
    });
    yield* fs.writeFileString(paths.analyticsStatePath, contents);
  }).pipe(Effect.catchAll(() => Effect.void));

const readUserConfig = Effect.gen(function* () {
  const paths = yield* getAnalyticsPaths;
  return yield* readOptionalJson<{ api_key?: unknown; base_url?: unknown }>(paths.userConfigPath);
});

const getUserApiKey = Effect.gen(function* () {
  const envApiKey = configuredString(
    yield* environmentProvider.load(optionalString('COMPOSIO_USER_API_KEY'))
  );
  if (envApiKey) {
    return envApiKey;
  }

  const userConfig = yield* readUserConfig;
  return typeof userConfig?.api_key === 'string' && userConfig.api_key.trim().length > 0
    ? userConfig.api_key.trim()
    : null;
});

// Post-login events key on the Apollo `org_member.id` (persisted at login) so
// they resolve to the same PostHog person as web onboarding. Pre-login, the raw
// `install_id` is the distinct id (NOT wrapped as `anon_<id>` — the login-time
// `$create_alias` merges this exact value into the Apollo person).
const getDistinctId = (installId: string) =>
  Effect.map(readApolloUserId, apolloUserId => apolloUserId ?? installId);

const cwdHash = (cwd: string): string => djb2Hash(cwd).toString(36);

export const getCurrentCwdSessionId = (cwd = process.cwd()) =>
  Effect.gen(function* () {
    const paths = yield* getAnalyticsPaths;
    const state = yield* readOptionalJson<ConsumerShortTermCacheState>(
      paths.consumerShortTermCachePath
    );
    if (!state) {
      return undefined;
    }

    const currentCwdHash = cwdHash(cwd);
    const now = yield* Clock.currentTimeMillis;
    let best: { id: string; expiresAtMs: number } | undefined;

    for (const entry of Object.values(state)) {
      const session = entry.probablyMyCliSessionsByCwdHash?.[currentCwdHash];
      if (!session?.id) continue;
      const expiresAtMs = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) continue;
      if (!best || expiresAtMs > best.expiresAtMs) {
        best = { id: session.id, expiresAtMs };
      }
    }

    return best?.id;
  }).pipe(Effect.catchAllCause(() => Effect.succeed(undefined)));

const withCliSessionId = (event: NonNullable<TrackEvent>, cliSessionId?: string): TrackEvent => ({
  ...event,
  properties: {
    ...(event.properties ?? {}),
    cli_version: event.properties?.cli_version ?? constants.APP_VERSION,
    ...(cliSessionId ? { cli_session_id: cliSessionId } : {}),
  },
});

export const readApiBaseUrl = Effect.gen(function* () {
  const envBaseUrl = configuredString(
    yield* environmentProvider.load(optionalString('COMPOSIO_BASE_URL'))
  );
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/+$/u, '');
  }

  const userConfig = yield* readUserConfig;
  return typeof userConfig?.base_url === 'string' && userConfig.base_url.trim().length > 0
    ? userConfig.base_url.trim().replace(/\/+$/u, '')
    : null;
}).pipe(Effect.catchAllCause(() => Effect.succeed(null)));

const getCliCodactFailuresEndpoint = Effect.map(readApiBaseUrl, baseUrl =>
  baseUrl ? `${baseUrl}${CLI_CODACT_FAILURES_PATH}` : null
);

const getWorkerSpawnArgs = (workerFlag: string, encodedPayload: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const maybeScriptPath = process.argv[1];
    const scriptPathExists =
      typeof maybeScriptPath === 'string' && maybeScriptPath.length > 0
        ? yield* fs.exists(maybeScriptPath).pipe(Effect.catchAll(() => Effect.succeed(false)))
        : false;
    const scriptPathLooksReal =
      scriptPathExists && /\.(?:[cm]?[jt]s|mjs|mts|cts)$/u.test(maybeScriptPath ?? '');

    return scriptPathLooksReal
      ? {
          command: process.execPath,
          args: [maybeScriptPath as string, workerFlag, encodedPayload],
        }
      : {
          command: process.execPath,
          args: [workerFlag, encodedPayload],
        };
  });

// Effect's Command processes are scoped and die with their scope; telemetry
// workers intentionally outlive the CLI process, so they go through the
// sanctioned detached-spawn boundary in src/services/detached-process.
// Delivery is best effort: a failed spawn is swallowed, never surfaced.
const spawnWorker = (command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const debugEnabled = yield* telemetryDebugEnabled;
    yield* spawnDetached(command, args, { inheritStderr: debugEnabled }).pipe(
      Effect.catchTag('services/DetachedProcessSpawnError', () => Effect.void)
    );
  });

// Shapes an analytics envelope into a PostHog single-event capture body. The
// public project write key authenticates the ingest in-band (no user API key),
// which is what lets pre-login events send. Only allowlisted, already-shaped
// properties from the event builders flow through here — no secrets or tool-arg
// values (see events.ts).
const buildPostHogBody = (envelope: AnalyticsEnvelope, projectKey: string) => ({
  api_key: projectKey,
  event: envelope.event,
  distinct_id: envelope.distinctId,
  timestamp: envelope.sentAt,
  properties: {
    ...(envelope.properties ?? {}),
    install_id: envelope.installId,
    $lib: POSTHOG_LIB,
    $lib_version: constants.APP_VERSION,
  },
});

const captureToPostHog = (envelope: AnalyticsEnvelope) =>
  Effect.gen(function* () {
    const disabled = yield* analyticsDisabled;
    const { ingestUrl, projectKey } = yield* getPostHogConfig;
    if (disabled || projectKey.length === 0) {
      yield* telemetryDebugLog('posthog_delivery_skipped', {
        reason: disabled ? 'disabled' : 'missing_project_key',
        endpoint: ingestUrl,
        eventName: envelope.event,
      });
      return;
    }

    const httpClient = yield* HttpClient.HttpClient;
    const request = yield* HttpClientRequest.post(ingestUrl).pipe(
      HttpClientRequest.setHeader('x-composio-analytics-source', 'cli'),
      HttpClientRequest.bodyJson(buildPostHogBody(envelope, projectKey))
    );
    const response = yield* httpClient.execute(request);
    const responseOk = response.status >= 200 && response.status < 300;
    const debugEnabled = yield* telemetryDebugEnabled;
    const responseBody = !responseOk && debugEnabled ? yield* response.text : undefined;

    yield* telemetryDebugLog(
      responseOk ? 'posthog_delivery_succeeded' : 'posthog_delivery_failed',
      {
        endpoint: ingestUrl,
        eventName: envelope.event,
        status: response.status,
        ok: responseOk,
        responseBody: responseBody?.slice(0, 1000),
      }
    );
  });

type CliCodactFailureBody = {
  failure_type: CliCodactFailureType;
  tool_info?: CliCodactFailureToolInfo;
  ctx: Record<string, unknown>;
  session: Record<string, unknown>;
  request_id?: string;
};

type CliInvocationContext = {
  readonly origin?: string;
  readonly parentRunId?: string;
};

const getCliInvocationContext = environmentProvider
  .load(
    Config.all({
      origin: optionalString('COMPOSIO_CLI_INVOCATION_ORIGIN'),
      parentRunId: optionalString('COMPOSIO_CLI_PARENT_RUN_ID'),
    })
  )
  .pipe(
    Effect.map(({ origin, parentRunId }) => ({
      origin: configuredString(origin),
      parentRunId: configuredString(parentRunId),
    }))
  );

export const createCliCodactFailureBody = (
  failure: CliCodactFailure,
  cliSessionId?: string,
  invocation: CliInvocationContext = {}
): CliCodactFailureBody => ({
  failure_type: failure.failureType,
  ...(failure.toolInfo ? { tool_info: failure.toolInfo } : {}),
  ctx: failure.ctx,
  session: {
    source: 'cli',
    id: cliSessionId,
    cli_version: constants.APP_VERSION,
    invocation_origin: invocation.origin ?? 'cli',
    parent_run_id: invocation.parentRunId,
    ...(failure.session ?? {}),
  },
  ...(failure.requestId ? { request_id: failure.requestId } : {}),
});

const captureToComposioCodactFailures = (failure: CliCodactFailure) =>
  Effect.gen(function* () {
    const endpoint = yield* getCliCodactFailuresEndpoint;
    const disabled = yield* analyticsDisabled;
    if (!endpoint || disabled) {
      yield* telemetryDebugLog('codact_delivery_skipped', {
        reason: disabled ? 'disabled' : 'missing_endpoint',
        endpoint,
        failureType: failure.failureType,
      });
      return;
    }

    const userApiKey = yield* getUserApiKey;
    if (!userApiKey) {
      yield* telemetryDebugLog('codact_delivery_skipped', {
        reason: 'missing_user_api_key',
        endpoint,
        failureType: failure.failureType,
      });
      return;
    }

    const httpClient = yield* HttpClient.HttpClient;
    const cliSessionId = yield* getCurrentCwdSessionId();
    const invocation = yield* getCliInvocationContext;
    const body = createCliCodactFailureBody(failure, cliSessionId, invocation);
    const request = yield* HttpClientRequest.post(endpoint).pipe(
      HttpClientRequest.setHeader('x-user-api-key', userApiKey),
      HttpClientRequest.bodyJson(body)
    );
    const response = yield* httpClient.execute(request);
    const responseOk = response.status >= 200 && response.status < 300;
    const debugEnabled = yield* telemetryDebugEnabled;
    const responseBody = !responseOk && debugEnabled ? yield* response.text : undefined;

    yield* telemetryDebugLog(responseOk ? 'codact_delivery_succeeded' : 'codact_delivery_failed', {
      endpoint,
      failureType: failure.failureType,
      status: response.status,
      ok: responseOk,
      responseBody: responseBody?.slice(0, 1000),
    });
  });

// Encodes an envelope and hands it to the detached best-effort worker, which
// delivers it directly to PostHog. Shared by event tracking and login aliasing.
const enqueuePostHogEnvelope = (envelope: AnalyticsEnvelope) =>
  Effect.gen(function* () {
    yield* telemetryDebugLog('enqueue', { envelope });
    const serializedEnvelope = yield* encodeJson(envelope);
    const encodedPayload = Encoding.encodeBase64Url(serializedEnvelope);
    const { command, args } = yield* getWorkerSpawnArgs(
      INTERNAL_ANALYTICS_WORKER_FLAG,
      encodedPayload
    );
    yield* spawnWorker(command, args);
  });

export const trackCliEventEffect = (event: TrackEvent) =>
  Effect.gen(function* () {
    if (!event) {
      return;
    }

    // The direct PostHog transport carries a fixed endpoint + embedded public
    // key, so — unlike the old Apollo path — there is no base-URL gate here and
    // pre-login install/setup events are delivered.
    const disabled = yield* analyticsDisabled;
    if (disabled) {
      yield* telemetryDebugLog('skip', { reason: 'disabled', eventName: event.name });
      return;
    }

    const cliSessionId = yield* getCurrentCwdSessionId();
    const enrichedEvent = withCliSessionId(event, cliSessionId);
    if (!enrichedEvent) {
      return;
    }

    const installId = yield* getOrCreateInstallId;
    const distinctId = yield* getDistinctId(installId);
    const sentAt = DateTime.formatIso(yield* DateTime.now);
    const envelope: AnalyticsEnvelope = {
      event: enrichedEvent.name,
      ...(enrichedEvent.properties ? { properties: enrichedEvent.properties } : {}),
      sentAt,
      source: 'cli',
      distinctId,
      installId,
    };
    yield* enqueuePostHogEnvelope(envelope);
  }).pipe(Effect.catchAllCause(() => Effect.void));

// Fires a single PostHog `$create_alias` merging the anonymous `install_id`
// device person into the identified Apollo `org_member.id` person. Best-effort.
export const emitPostHogAlias = (installId: string, apolloUserId: string) =>
  Effect.gen(function* () {
    const disabled = yield* analyticsDisabled;
    if (disabled) {
      yield* telemetryDebugLog('alias_skip', { reason: 'disabled', installId });
      return;
    }

    const sentAt = DateTime.formatIso(yield* DateTime.now);
    const envelope: AnalyticsEnvelope = {
      event: POSTHOG_ALIAS_EVENT,
      properties: {
        // PostHog merges `properties.alias` into the event's `distinct_id`.
        distinct_id: apolloUserId,
        alias: installId,
        cli_version: constants.APP_VERSION,
      },
      sentAt,
      source: 'cli',
      distinctId: apolloUserId,
      installId,
    };
    yield* enqueuePostHogEnvelope(envelope);
  }).pipe(Effect.catchAllCause(() => Effect.void));

// Called at login: persists the Apollo `org_member.id` as the analytics identity
// and stitches the pre-login anonymous device into that person via one alias.
// Fully non-fatal so login never fails on telemetry.
export const linkApolloIdentityForAnalytics = (apolloUserId: string) =>
  Effect.gen(function* () {
    if (typeof apolloUserId !== 'string' || apolloUserId.trim().length === 0) {
      return;
    }

    const disabled = yield* analyticsDisabled;
    const installId = yield* getOrCreateInstallId;
    yield* persistApolloUserId(installId, apolloUserId);
    if (disabled) {
      return;
    }
    yield* emitPostHogAlias(installId, apolloUserId);
  }).pipe(Effect.catchAllCause(() => Effect.void));

export const trackCliCodactFailureEffect = (failure: CliCodactFailure) =>
  Effect.gen(function* () {
    const endpoint = yield* getCliCodactFailuresEndpoint;
    const userApiKey = yield* getUserApiKey;
    const disabled = yield* analyticsDisabled;
    if (disabled || !endpoint || !userApiKey) {
      yield* telemetryDebugLog('codact_skip', {
        reason: disabled ? 'disabled' : !endpoint ? 'missing_endpoint' : 'missing_user_api_key',
        failureType: failure.failureType,
        endpoint,
      });
      return;
    }

    const cliSessionId = yield* getCurrentCwdSessionId();
    const invocation = yield* getCliInvocationContext;
    const body = yield* encodeJson(createCliCodactFailureBody(failure, cliSessionId, invocation));
    const encodedPayload = Encoding.encodeBase64Url(body);
    const { command, args } = yield* getWorkerSpawnArgs(
      INTERNAL_CODACT_FAILURE_WORKER_FLAG,
      encodedPayload
    );
    yield* spawnWorker(command, args);
  }).pipe(Effect.catchAllCause(() => Effect.void));

const getWorkerFlagIndex = (argv: ReadonlyArray<string>, flag: string): number =>
  argv.findIndex(token => token === flag);

export const isBackgroundWorkerInvocation = (argv: ReadonlyArray<string>): boolean =>
  getWorkerFlagIndex(argv, INTERNAL_ANALYTICS_WORKER_FLAG) >= 0 ||
  getWorkerFlagIndex(argv, INTERNAL_CODACT_FAILURE_WORKER_FLAG) >= 0;

const decodeWorkerPayload = <A>(encodedPayload: string) =>
  Effect.gen(function* () {
    const serialized = yield* Encoding.decodeBase64UrlString(encodedPayload);
    return (yield* decodeJson(serialized)) as A;
  });

const runAnalyticsWorker = (argv: ReadonlyArray<string>) => {
  const flagIndex = getWorkerFlagIndex(argv, INTERNAL_ANALYTICS_WORKER_FLAG);
  if (flagIndex < 0) {
    return Effect.succeed(false);
  }

  const encodedPayload = argv[flagIndex + 1];
  if (!encodedPayload) {
    return Effect.succeed(true);
  }

  return Effect.gen(function* () {
    const envelope = yield* decodeWorkerPayload<AnalyticsEnvelope>(encodedPayload);
    if (typeof envelope?.event !== 'string' || envelope.event.length === 0) {
      return true;
    }
    yield* captureToPostHog(envelope);
    return true;
  }).pipe(
    Effect.catchAllCause(cause =>
      telemetryDebugLog('delivery_error', { error: telemetryErrorDetails(cause) }).pipe(
        Effect.as(true)
      )
    )
  );
};

const runCodactFailureWorker = (argv: ReadonlyArray<string>) => {
  const flagIndex = getWorkerFlagIndex(argv, INTERNAL_CODACT_FAILURE_WORKER_FLAG);
  if (flagIndex < 0) {
    return Effect.void;
  }

  const encodedPayload = argv[flagIndex + 1];
  if (!encodedPayload) {
    return Effect.void;
  }

  return Effect.gen(function* () {
    const body =
      yield* decodeWorkerPayload<ReturnType<typeof createCliCodactFailureBody>>(encodedPayload);
    if (
      body?.failure_type !== 'wrong_tool_slug' &&
      body?.failure_type !== 'wrong_tool_input_param'
    ) {
      return;
    }

    yield* captureToComposioCodactFailures({
      failureType: body.failure_type,
      toolInfo: body.tool_info,
      ctx: body.ctx,
      session: body.session,
      requestId: body.request_id,
    });
  }).pipe(
    Effect.catchAllCause(cause =>
      telemetryDebugLog('codact_delivery_error', { error: telemetryErrorDetails(cause) })
    )
  );
};

export const runBackgroundWorkerFromArgv = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const handledAnalytics = yield* runAnalyticsWorker(argv);
    if (!handledAnalytics) {
      yield* runCodactFailureWorker(argv);
    }
  }).pipe(Effect.catchAllCause(() => Effect.void));
