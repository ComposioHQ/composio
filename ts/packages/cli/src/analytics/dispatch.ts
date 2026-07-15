import { spawn } from 'node:child_process';
import process from 'node:process';
import { FileSystem, Path } from '@effect/platform';
import { Cause, Data, Effect } from 'effect';
import * as constants from 'src/constants';
import { NodeOs } from 'src/services/node-os';
import type { AnalyticsEnvelope, TrackEvent } from './types';

const INTERNAL_ANALYTICS_WORKER_FLAG = '__analytics-worker';
const INTERNAL_CODACT_FAILURE_WORKER_FLAG = '__codact-failure-worker';
const COMPOSIO_DIR = '.composio';
const ANALYTICS_STATE_FILE_NAME = 'analytics.json';
const CONSUMER_SHORT_TERM_CACHE_FILE_NAME = 'consumer-short-term-cache.json';
const CLI_ANALYTICS_PATH = '/api/v3/cli/analytics';
const CLI_CODACT_FAILURES_PATH = '/api/v3/cli/codact_failures';
const TELEMETRY_DEBUG_ENV_VAR = 'COMPOSIO_CLI_TELEMETRY_DEBUG';

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

class TelemetryError extends Data.TaggedError('TelemetryError')<{
  readonly cause: unknown;
}> {}

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

const truthy = (value: string | undefined): boolean =>
  value === '1' || value === 'true' || value === 'yes' || value === 'on';

const isTelemetryDebugEnabled = (): boolean => truthy(process.env[TELEMETRY_DEBUG_ENV_VAR]);

const attempt = <A>(evaluate: () => A) =>
  Effect.try({
    try: evaluate,
    catch: cause => new TelemetryError({ cause }),
  });

const attemptPromise = <A>(evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: cause => new TelemetryError({ cause }),
  });

const parseJson = <A>(value: string) => attempt(() => JSON.parse(value) as A);

const stringifyJson = (value: unknown) => attempt(() => JSON.stringify(value));

const telemetryDebugLog = (label: string, payload: Record<string, unknown>) =>
  isTelemetryDebugEnabled()
    ? attempt(() =>
        process.stderr.write(
          `[telemetry-debug] ${JSON.stringify(
            {
              label,
              ...payload,
            },
            null,
            2
          )}\n`
        )
      ).pipe(Effect.ignore)
    : Effect.void;

const telemetryErrorDetails = (cause: Cause.Cause<unknown>): Record<string, string> => {
  const squashed = Cause.squash(cause);
  const error = squashed instanceof TelemetryError ? squashed.cause : squashed;
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error) };
};

const getAnalyticsPaths = Effect.gen(function* () {
  const path = yield* Path.Path;
  const os = yield* NodeOs;
  const analyticsDir = path.join(os.homedir, COMPOSIO_DIR);
  const cacheDir =
    process.env.COMPOSIO_CACHE_DIR?.trim() ||
    process.env.CACHE_DIR?.trim() ||
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
    return yield* parseJson<A>(raw);
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const djb2Hash = (value: string): number => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash >>> 0);
};

const hashString = (value: string): string => djb2Hash(value).toString(16).padStart(8, '0');

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

  const installId = yield* attempt(() => crypto.randomUUID());
  const contents = yield* stringifyJson({
    install_id: installId,
    created_at: new Date().toISOString(),
  });
  yield* fs.writeFileString(paths.analyticsStatePath, contents);
  return installId;
}).pipe(Effect.catchAll(() => attempt(() => crypto.randomUUID())));

const readUserConfig = Effect.gen(function* () {
  const paths = yield* getAnalyticsPaths;
  return yield* readOptionalJson<{ api_key?: unknown; base_url?: unknown }>(paths.userConfigPath);
});

const getUserApiKey = Effect.gen(function* () {
  const envApiKey = process.env.COMPOSIO_USER_API_KEY?.trim();
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
    const now = Date.now();
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
  const envBaseUrl = process.env.COMPOSIO_BASE_URL?.trim();
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

export const shouldDisableAnalytics = (): boolean =>
  truthy(process.env.COMPOSIO_CLI_TELEMETRY_DISABLED) ||
  truthy(process.env.TELEMETRY_DISABLED) ||
  truthy(process.env.COMPOSIO_DISABLE_TELEMETRY) ||
  process.env.NODE_ENV === 'test' ||
  process.env.CI === 'true';

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

const spawnWorker = (command: string, args: ReadonlyArray<string>) =>
  attempt(() => {
    const child = spawn(command, args, {
      detached: true,
      stdio: isTelemetryDebugEnabled() ? ['ignore', 'ignore', 'inherit'] : 'ignore',
      env: {
        ...process.env,
        COMPOSIO_CLI_ANALYTICS_WORKER: '1',
      },
    });
    child.on('error', () => undefined);
    child.unref();
  });

const captureToComposioAnalytics = (envelope: AnalyticsEnvelope) =>
  Effect.gen(function* () {
    const endpoint = yield* getAnalyticsEndpoint;
    if (!endpoint || shouldDisableAnalytics()) {
      yield* telemetryDebugLog('delivery_skipped', {
        reason: shouldDisableAnalytics() ? 'disabled' : 'missing_endpoint',
        endpoint,
        eventName: envelope.event,
      });
      return;
    }

    const userApiKey = yield* getUserApiKey;
    const body = yield* stringifyJson(envelope);
    const response = yield* attemptPromise(() =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-composio-analytics-source': 'cli',
          ...(userApiKey ? { 'x-user-api-key': userApiKey } : {}),
        },
        body,
      })
    );
    const responseBody =
      !response.ok && isTelemetryDebugEnabled()
        ? yield* attemptPromise(() => response.text())
        : undefined;

    yield* telemetryDebugLog(response.ok ? 'delivery_succeeded' : 'delivery_failed', {
      endpoint,
      eventName: envelope.event,
      status: response.status,
      ok: response.ok,
      responseBody: responseBody?.slice(0, 1000),
    });
  });

export const createCliCodactFailureBody = (
  failure: CliCodactFailure,
  cliSessionId?: string
): {
  failure_type: CliCodactFailureType;
  tool_info?: CliCodactFailureToolInfo;
  ctx: Record<string, unknown>;
  session: Record<string, unknown>;
  request_id?: string;
} => ({
  failure_type: failure.failureType,
  ...(failure.toolInfo ? { tool_info: failure.toolInfo } : {}),
  ctx: failure.ctx,
  session: {
    source: 'cli',
    id: cliSessionId,
    cli_version: constants.APP_VERSION,
    invocation_origin: process.env.COMPOSIO_CLI_INVOCATION_ORIGIN ?? 'cli',
    parent_run_id: process.env.COMPOSIO_CLI_PARENT_RUN_ID,
    ...(failure.session ?? {}),
  },
  ...(failure.requestId ? { request_id: failure.requestId } : {}),
});

const captureToComposioCodactFailures = (failure: CliCodactFailure) =>
  Effect.gen(function* () {
    const endpoint = yield* getCliCodactFailuresEndpoint;
    if (!endpoint || shouldDisableAnalytics()) {
      yield* telemetryDebugLog('codact_delivery_skipped', {
        reason: shouldDisableAnalytics() ? 'disabled' : 'missing_endpoint',
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

    const cliSessionId = yield* getCurrentCwdSessionId();
    const body = yield* stringifyJson(createCliCodactFailureBody(failure, cliSessionId));
    const response = yield* attemptPromise(() =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-api-key': userApiKey,
        },
        body,
      })
    );
    const responseBody =
      !response.ok && isTelemetryDebugEnabled()
        ? yield* attemptPromise(() => response.text())
        : undefined;

    yield* telemetryDebugLog(response.ok ? 'codact_delivery_succeeded' : 'codact_delivery_failed', {
      endpoint,
      failureType: failure.failureType,
      status: response.status,
      ok: response.ok,
      responseBody: responseBody?.slice(0, 1000),
    });
  });

export const trackCliEventEffect = (event: TrackEvent) =>
  Effect.gen(function* () {
    if (!event) {
      return;
    }

    const endpoint = yield* getAnalyticsEndpoint;
    if (shouldDisableAnalytics() || !endpoint) {
      yield* telemetryDebugLog('skip', {
        reason: shouldDisableAnalytics() ? 'disabled' : 'missing_endpoint',
        eventName: event.name,
        endpoint,
      });
      return;
    }

    const cliSessionId = yield* getCurrentCwdSessionId();
    const enrichedEvent = withCliSessionId(event, cliSessionId);
    if (!enrichedEvent) {
      return;
    }

    const installId = yield* getOrCreateInstallId;
    const distinctId = yield* getDistinctId(installId);
    const envelope: AnalyticsEnvelope = {
      event: enrichedEvent.name,
      ...(enrichedEvent.properties ? { properties: enrichedEvent.properties } : {}),
      sentAt: new Date().toISOString(),
      source: 'cli',
      distinctId,
      installId,
    };
    yield* telemetryDebugLog('enqueue', { endpoint, envelope });
    const serializedEnvelope = yield* stringifyJson(envelope);
    const encodedPayload = yield* attempt(() => encodeBase64Url(serializedEnvelope));
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
    if (shouldDisableAnalytics() || !endpoint || !userApiKey) {
      yield* telemetryDebugLog('codact_skip', {
        reason: shouldDisableAnalytics()
          ? 'disabled'
          : !endpoint
            ? 'missing_endpoint'
            : 'missing_user_api_key',
        failureType: failure.failureType,
        endpoint,
      });
      return;
    }

    const cliSessionId = yield* getCurrentCwdSessionId();
    const body = yield* stringifyJson(createCliCodactFailureBody(failure, cliSessionId));
    const encodedPayload = yield* attempt(() => encodeBase64Url(body));
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
  attempt(() => decodeBase64Url(encodedPayload)).pipe(Effect.flatMap(parseJson<A>));

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
