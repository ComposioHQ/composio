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
import { getInstalledCliVersion } from 'src/effects/version';
import { getWorkerSpawnArgs, spawnDetached } from 'src/services/detached-process';
import { djb2Hash } from 'src/utils/djb2';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import type { AnalyticsEnvelope, TrackEvent } from './types';

const INTERNAL_ANALYTICS_WORKER_FLAG = '__analytics-worker';
const INTERNAL_CODACT_FAILURE_WORKER_FLAG = '__codact-failure-worker';
const COMPOSIO_DIR = '.composio';
const ANALYTICS_STATE_FILE_NAME = 'analytics.json';
const CONSUMER_SHORT_TERM_CACHE_FILE_NAME = 'consumer-short-term-cache.json';
const CLI_ANALYTICS_PATH = '/api/v3/cli/analytics';
const CLI_CODACT_FAILURES_PATH = '/api/v3/cli/codact_failures';

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

const hashString = (value: string): string => djb2Hash(value).toString(16).padStart(8, '0');

const makeInstallId = Effect.sync(() => crypto.randomUUID());

const getOrCreateInstallId = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* getAnalyticsPaths;

  yield* fs
    .makeDirectory(paths.analyticsDir, { recursive: true })
    .pipe(Effect.catchAll(() => Effect.void));

  const state = yield* readOptionalJson<{ install_id?: unknown }>(paths.analyticsStatePath);
  if (typeof state?.install_id === 'string' && state.install_id.length > 0) {
    return state.install_id;
  }

  const installId = yield* makeInstallId;
  const createdAt = DateTime.formatIso(yield* DateTime.now);
  const contents = yield* encodeJson({
    install_id: installId,
    created_at: createdAt,
  });
  yield* fs.writeFileString(paths.analyticsStatePath, contents);
  return installId;
}).pipe(Effect.catchAll(() => makeInstallId));

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

const getDistinctId = (installId: string) =>
  Effect.map(getUserApiKey, userApiKey =>
    userApiKey ? `user_${hashString(userApiKey)}` : `anon_${installId}`
  );

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

const withCliSessionId = (
  event: NonNullable<TrackEvent>,
  cliVersion: string,
  cliSessionId?: string
): TrackEvent => ({
  ...event,
  properties: {
    ...(event.properties ?? {}),
    cli_version: cliVersion,
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

const getAnalyticsEndpoint = Effect.map(readApiBaseUrl, baseUrl =>
  baseUrl ? `${baseUrl}${CLI_ANALYTICS_PATH}` : null
);

const getCliCodactFailuresEndpoint = Effect.map(readApiBaseUrl, baseUrl =>
  baseUrl ? `${baseUrl}${CLI_CODACT_FAILURES_PATH}` : null
);

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

const captureToComposioAnalytics = (envelope: AnalyticsEnvelope) =>
  Effect.gen(function* () {
    const endpoint = yield* getAnalyticsEndpoint;
    const disabled = yield* analyticsDisabled;
    if (!endpoint || disabled) {
      yield* telemetryDebugLog('delivery_skipped', {
        reason: disabled ? 'disabled' : 'missing_endpoint',
        endpoint,
        eventName: envelope.event,
      });
      return;
    }

    const httpClient = yield* HttpClient.HttpClient;
    const userApiKey = yield* getUserApiKey;
    const request = yield* HttpClientRequest.post(endpoint).pipe(
      HttpClientRequest.setHeaders({
        'x-composio-analytics-source': 'cli',
        ...(userApiKey ? { 'x-user-api-key': userApiKey } : {}),
      }),
      HttpClientRequest.bodyJson(envelope)
    );
    const response = yield* httpClient.execute(request);
    const responseOk = response.status >= 200 && response.status < 300;
    const debugEnabled = yield* telemetryDebugEnabled;
    const responseBody = !responseOk && debugEnabled ? yield* response.text : undefined;

    yield* telemetryDebugLog(responseOk ? 'delivery_succeeded' : 'delivery_failed', {
      endpoint,
      eventName: envelope.event,
      status: response.status,
      ok: responseOk,
      responseBody: responseBody?.slice(0, 1000),
    });
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
  invocation: CliInvocationContext = {},
  cliVersion: string = constants.APP_VERSION
): CliCodactFailureBody => ({
  failure_type: failure.failureType,
  ...(failure.toolInfo ? { tool_info: failure.toolInfo } : {}),
  ctx: failure.ctx,
  session: {
    source: 'cli',
    id: cliSessionId,
    cli_version: cliVersion,
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
    const cliVersion = yield* getInstalledCliVersion;
    const body = createCliCodactFailureBody(failure, cliSessionId, invocation, cliVersion);
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

export const trackCliEventEffect = (event: TrackEvent) =>
  Effect.gen(function* () {
    if (!event) {
      return;
    }

    const endpoint = yield* getAnalyticsEndpoint;
    const disabled = yield* analyticsDisabled;
    if (disabled || !endpoint) {
      yield* telemetryDebugLog('skip', {
        reason: disabled ? 'disabled' : 'missing_endpoint',
        eventName: event.name,
        endpoint,
      });
      return;
    }

    const cliSessionId = yield* getCurrentCwdSessionId();
    const cliVersion = yield* getInstalledCliVersion;
    const enrichedEvent = withCliSessionId(event, cliVersion, cliSessionId);
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
    yield* telemetryDebugLog('enqueue', { endpoint, envelope });
    const serializedEnvelope = yield* encodeJson(envelope);
    const encodedPayload = Encoding.encodeBase64Url(serializedEnvelope);
    const { command, args } = yield* getWorkerSpawnArgs(
      INTERNAL_ANALYTICS_WORKER_FLAG,
      encodedPayload
    );
    yield* spawnWorker(command, args);
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
    const cliVersion = yield* getInstalledCliVersion;
    const body = yield* encodeJson(
      createCliCodactFailureBody(failure, cliSessionId, invocation, cliVersion)
    );
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
    yield* captureToComposioAnalytics(envelope);
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
