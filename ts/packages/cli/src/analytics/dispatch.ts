import process from 'node:process';
import { FileSystem, HttpClient, HttpClientRequest, Path } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
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
import { APP_CONFIG } from 'src/effects/app-config';
import { getDetachedWorkerSpawnArgs, spawnDetached } from 'src/services/detached-process';
import { extendConfigProvider } from 'src/services/config';
import { atomicWriteFileString } from 'src/utils/atomic-write';
import { sha256Hex } from 'src/utils/checksums';
import { djb2Hash } from 'src/utils/djb2';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { isTelemetryDebugEnabled, TELEMETRY_DEBUG_FLAG } from 'src/services/runtime-flags';
import { CliRunId } from 'src/services/runtime-cli-context';
import type { AnalyticsEnvelope, TrackEvent } from './types';

const INTERNAL_ANALYTICS_WORKER_FLAG = '__analytics-worker';
const INTERNAL_CODACT_FAILURE_WORKER_FLAG = '__codact-failure-worker';
const COMPOSIO_DIR = '.composio';
const ANALYTICS_STATE_FILE_NAME = 'analytics.json';
const ANALYTICS_STATE_LOCK_FILE_NAME = `${ANALYTICS_STATE_FILE_NAME}.lock`;
const ANALYTICS_STATE_LOCK_STALE_MS = 30_000;
const ANALYTICS_STATE_LOCK_RETRY_MS = 10;
const ANALYTICS_STATE_LOCK_TIMEOUT_MS = 500;
const PENDING_ALIAS_RETRY_MS = 5 * 60 * 1000;
const CONSUMER_SHORT_TERM_CACHE_FILE_NAME = 'consumer-short-term-cache.json';
const CLI_CODACT_FAILURES_PATH = '/api/v3/cli/codact_failures';

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

const getPostHogConfig = environmentProvider
  .load(
    Config.all({
      ingestUrl: optionalString('COMPOSIO_POSTHOG_INGEST_URL'),
      projectKey: optionalString('COMPOSIO_POSTHOG_PROJECT_API_KEY'),
    })
  )
  .pipe(
    Effect.map(({ ingestUrl, projectKey }) => ({
      ingestUrl: configuredString(ingestUrl) ?? constants.COMPOSIO_POSTHOG_INGEST_URL,
      projectKey: configuredString(projectKey) ?? constants.COMPOSIO_POSTHOG_PROJECT_API_KEY,
    }))
  );

const postHogEnabled = Effect.gen(function* () {
  if (yield* analyticsDisabled) {
    return false;
  }
  const { projectKey } = yield* getPostHogConfig;
  return projectKey.length > 0;
});

export const analyticsIdentityLinkingEnabled = postHogEnabled;

const jsonFromString = Schema.parseJson();
const prettyJsonFromString = Schema.parseJson({ space: 2 });
const decodeJson = Schema.decodeUnknown(jsonFromString);
const encodeJson = Schema.encode(jsonFromString);
const encodePrettyJson = Schema.encode(prettyJsonFromString);

const telemetryDebugLog = (label: string, payload: Record<string, unknown>) =>
  Effect.gen(function* () {
    if (!(yield* isTelemetryDebugEnabled)) {
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
    analyticsStateLockPath: path.join(analyticsDir, ANALYTICS_STATE_LOCK_FILE_NAME),
    // user_data.json and config.json live in the cache dir (setup-cache-dir.ts,
    // cli-user-config.ts), which COMPOSIO_CACHE_DIR relocates away from ~/.composio.
    userConfigPath: path.join(cacheDir, constants.USER_CONFIG_FILE_NAME),
    cliConfigPath: path.join(cacheDir, constants.CLI_CONFIG_FILE_NAME),
    consumerShortTermCachePath: path.join(cacheDir, CONSUMER_SHORT_TERM_CACHE_FILE_NAME),
  };
});

const readOptionalJson = <A>(filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(filePath, 'utf8');
    return (yield* decodeJson(raw)) as A;
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

type AnalyticsState = {
  readonly install_id?: string;
  readonly apollo_user_id?: string;
  readonly aliased_apollo_user_id?: string;
  readonly pending_alias_apollo_user_id?: string;
  readonly pending_alias_install_id?: string;
  readonly pending_alias_attempted_at?: string;
  readonly api_key_fingerprint?: string;
  readonly created_at?: string;
};

const makeInstallId = Effect.sync(() => crypto.randomUUID());

const readAnalyticsState = Effect.gen(function* () {
  const paths = yield* getAnalyticsPaths;
  return yield* readOptionalJson<AnalyticsState>(paths.analyticsStatePath);
});

const recoverStaleAnalyticsStateLock = (
  fs: FileSystem.FileSystem,
  lockPath: string
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const info = yield* fs.stat(lockPath);
    const modifiedAt = Option.getOrUndefined(info.mtime);
    if (!modifiedAt) {
      return;
    }
    if (Date.now() - modifiedAt.getTime() <= ANALYTICS_STATE_LOCK_STALE_MS) {
      return;
    }

    // Rename claims this exact stale lock atomically. A competing process can
    // then acquire the canonical path without being deleted by our cleanup.
    const stalePath = `${lockPath}.stale-${crypto.randomUUID().slice(0, 8)}`;
    yield* fs.rename(lockPath, stalePath);
    yield* fs.remove(stalePath, { force: true });
  }).pipe(Effect.catchAll(() => Effect.void));

const acquireAnalyticsStateLock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* getAnalyticsPaths;
  const token = crypto.randomUUID();
  const deadline = Date.now() + ANALYTICS_STATE_LOCK_TIMEOUT_MS;

  yield* fs.makeDirectory(paths.analyticsDir, { recursive: true });

  // Lock contention is wall-clock coordination between OS processes. Keeping
  // the retry on the platform timer also prevents Effect's TestClock from
  // freezing concurrent lock tests.
  const waitBeforeRetry = Effect.promise(
    () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, ANALYTICS_STATE_LOCK_RETRY_MS);
      })
  );
  const tryAcquire = (): Effect.Effect<void, PlatformError, never> =>
    fs.writeFileString(paths.analyticsStateLockPath, token, { flag: 'wx' }).pipe(
      Effect.catchTag('SystemError', error => {
        if (error.reason !== 'AlreadyExists') {
          return Effect.fail(error);
        }
        return recoverStaleAnalyticsStateLock(fs, paths.analyticsStateLockPath).pipe(
          Effect.andThen(
            fs
              .exists(paths.analyticsStateLockPath)
              .pipe(Effect.catchAll(() => Effect.succeed(true)))
          ),
          Effect.flatMap(lockStillExists => {
            if (lockStillExists && Date.now() >= deadline) {
              return Effect.fail(error);
            }
            return (lockStillExists ? waitBeforeRetry : Effect.void).pipe(
              Effect.andThen(tryAcquire())
            );
          })
        );
      })
    );

  yield* tryAcquire();
  return { fs, lockPath: paths.analyticsStateLockPath, token };
});

const releaseAnalyticsStateLock = (lock: Effect.Effect.Success<typeof acquireAnalyticsStateLock>) =>
  Effect.gen(function* () {
    const currentToken = yield* lock.fs.readFileString(lock.lockPath, 'utf8');
    if (currentToken === lock.token) {
      yield* lock.fs.remove(lock.lockPath, { force: true });
    }
  }).pipe(Effect.catchAll(() => Effect.void));

const withAnalyticsStateLock = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(acquireAnalyticsStateLock, () => effect, releaseAnalyticsStateLock);

// Concurrent CLI processes write this file; temp-file + rename keeps each
// write atomic so readers never observe partial JSON.
const writeAnalyticsStateFile = (contents: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* getAnalyticsPaths;
    yield* atomicWriteFileString({ fs, target: paths.analyticsStatePath, contents });
  });

const getOrCreateInstallIdUnlocked = Effect.gen(function* () {
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
  yield* writeAnalyticsStateFile(contents);
  return installId;
});

const getOrCreateInstallId = withAnalyticsStateLock(getOrCreateInstallIdUnlocked).pipe(
  Effect.catchAll(() => makeInstallId)
);

const mergeAnalyticsStateUnlocked = (installId: string, patch: Partial<AnalyticsState>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* getAnalyticsPaths;

    yield* fs
      .makeDirectory(paths.analyticsDir, { recursive: true })
      .pipe(Effect.catchAll(() => Effect.void));

    const state = yield* readOptionalJson<AnalyticsState>(paths.analyticsStatePath);
    const contents = yield* encodeJson({
      ...(state ?? {}),
      install_id: state?.install_id ?? installId,
      created_at: state?.created_at ?? DateTime.formatIso(yield* DateTime.now),
      ...patch,
    });
    yield* writeAnalyticsStateFile(contents);
  });

const readUserConfig = Effect.gen(function* () {
  const paths = yield* getAnalyticsPaths;
  return yield* readOptionalJson<{ api_key?: unknown; base_url?: unknown; org_id?: unknown }>(
    paths.userConfigPath
  );
});

const getOrgId = Effect.map(readUserConfig, config =>
  typeof config?.org_id === 'string' && config.org_id.length > 0 ? config.org_id : null
);

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

const fingerprintApiKey = (apiKey: string) =>
  Effect.promise(() => sha256Hex(new TextEncoder().encode(apiKey)));

const getApiKeyFingerprint = Effect.flatMap(getUserApiKey, apiKey =>
  apiKey ? fingerprintApiKey(apiKey) : Effect.succeed(null)
);

// The keychain* security modes strip the api key from user_data.json, so no
// fingerprint is computable here. A persisted org is the durable login signal:
// logout keeps the file but clears org_id, so a stale analytics identity can
// never survive a failed best-effort state cleanup.
const keyringBackedLoginPresent = Effect.gen(function* () {
  const paths = yield* getAnalyticsPaths;
  const cliConfig = yield* readOptionalJson<{ security?: unknown }>(paths.cliConfigPath);
  if (cliConfig?.security !== 'keychain' && cliConfig?.security !== 'keychain-subprocess') {
    return false;
  }
  const userConfig = yield* readUserConfig;
  return typeof userConfig?.org_id === 'string' && userConfig.org_id.trim().length > 0;
});

const getDistinctId = (installId: string) =>
  Effect.gen(function* () {
    const state = yield* readAnalyticsState;
    const apolloUserId = state?.apollo_user_id;
    const fingerprint = yield* getApiKeyFingerprint;

    if (typeof apolloUserId === 'string' && apolloUserId.length > 0) {
      if (fingerprint !== null && fingerprint === state?.api_key_fingerprint) {
        return apolloUserId;
      }
      if (fingerprint === null && (yield* keyringBackedLoginPresent)) {
        return apolloUserId;
      }
    }

    const installIdMayBeAliased =
      typeof state?.aliased_apollo_user_id === 'string' ||
      (state?.pending_alias_install_id === installId &&
        typeof state.pending_alias_apollo_user_id === 'string');
    if (!installIdMayBeAliased) {
      return installId;
    }
    return fingerprint !== null ? `user_${fingerprint}` : `anon_${installId}`;
  });

// The direct-to-PostHog path bypasses Apollo's server-side sanitizer, so
// secret-shaped tokens are redacted client-side before any envelope leaves.
const REDACTED_VALUE = '[redacted]';
const KNOWN_SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\buak_[A-Za-z0-9_-]+/gu,
  /\bak_[A-Za-z0-9_-]+/gu,
  /\bphc_[A-Za-z0-9]+/gu,
  /\bsk-[A-Za-z0-9_-]+/gu,
  /\bghp_[A-Za-z0-9]+/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gu,
];

// Mixed-case-plus-digit tokens of api-key length; single-case tokens
// (uuids, hex ids, tool slugs) stay untouched.
const isHighEntropyToken = (token: string): boolean =>
  token.length >= 24 &&
  /^[A-Za-z0-9+/=_-]+$/u.test(token) &&
  /[a-z]/u.test(token) &&
  /[A-Z]/u.test(token) &&
  /[0-9]/u.test(token);

const scrubSecretsFromString = (value: string): string =>
  KNOWN_SECRET_PATTERNS.reduce(
    (scrubbed, pattern) => scrubbed.replace(pattern, REDACTED_VALUE),
    value
  )
    .split(/(\s+)/u)
    .map(part => (isHighEntropyToken(part) ? REDACTED_VALUE : part))
    .join('');

const scrubSecrets = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return scrubSecretsFromString(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubSecrets);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        scrubSecrets(entry),
      ])
    );
  }
  return value;
};

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

// Effect's Command processes are scoped and die with their scope; telemetry
// workers intentionally outlive the CLI process, so they go through the
// sanctioned detached-spawn boundary in src/services/detached-process.
// Delivery is best effort: a failed spawn is swallowed, never surfaced.
const spawnWorker = (command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const debugEnabled = yield* isTelemetryDebugEnabled;
    const workerArgs = debugEnabled ? [...args, TELEMETRY_DEBUG_FLAG] : args;
    return yield* spawnDetached(command, workerArgs, { inheritStderr: debugEnabled }).pipe(
      Effect.as(true),
      Effect.catchTag('services/DetachedProcessSpawnError', () => Effect.succeed(false))
    );
  });

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
      return false;
    }

    const httpClient = yield* HttpClient.HttpClient;
    const request = yield* HttpClientRequest.post(ingestUrl).pipe(
      HttpClientRequest.setHeader('x-composio-analytics-source', 'cli'),
      HttpClientRequest.bodyJson(buildPostHogBody(envelope, projectKey))
    );
    const response = yield* httpClient.execute(request);
    const responseOk = response.status >= 200 && response.status < 300;
    const debugEnabled = yield* isTelemetryDebugEnabled;
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
    return responseOk;
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

// The COMPOSIO_CLI_PARENT_RUN_ID handshake only exists in processes `composio run` spawned. The
// root run process holds its freshly minted id in the CliRunId service instead, so failures it
// reports carry the same run id its children stamp from the environment.
const getCliInvocationContext = Effect.gen(function* () {
  const environment = yield* environmentProvider.pipe(extendConfigProvider).load(
    Config.all({
      origin: APP_CONFIG.CLI_INVOCATION_ORIGIN,
      parentRunId: APP_CONFIG.CLI_PARENT_RUN_ID,
    })
  );
  const mintedRunId = Option.flatten(yield* Effect.serviceOption(CliRunId));
  return {
    origin: environment.origin,
    parentRunId: environment.parentRunId ?? Option.getOrUndefined(mintedRunId),
  };
});

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
    const debugEnabled = yield* isTelemetryDebugEnabled;
    const responseBody = !responseOk && debugEnabled ? yield* response.text : undefined;

    yield* telemetryDebugLog(responseOk ? 'codact_delivery_succeeded' : 'codact_delivery_failed', {
      endpoint,
      failureType: failure.failureType,
      status: response.status,
      ok: responseOk,
      responseBody: responseBody?.slice(0, 1000),
    });
  });

const enqueuePostHogEnvelope = (envelope: AnalyticsEnvelope) =>
  Effect.gen(function* () {
    const { projectKey } = yield* getPostHogConfig;
    if (projectKey.length === 0) {
      yield* telemetryDebugLog('enqueue_skipped', {
        reason: 'missing_project_key',
        eventName: envelope.event,
      });
      return false;
    }

    yield* telemetryDebugLog('enqueue', { envelope });
    const serializedEnvelope = yield* encodeJson(envelope);
    const encodedPayload = Encoding.encodeBase64Url(serializedEnvelope);
    const { command, args } = yield* getDetachedWorkerSpawnArgs(
      INTERNAL_ANALYTICS_WORKER_FLAG,
      encodedPayload
    );
    return yield* spawnWorker(command, args);
  });

export const trackCliEventEffect = (event: TrackEvent) =>
  Effect.gen(function* () {
    if (!event) {
      return;
    }

    if (!(yield* postHogEnabled)) {
      yield* telemetryDebugLog('skip', {
        reason: (yield* analyticsDisabled) ? 'disabled' : 'missing_project_key',
        eventName: event.name,
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
    const orgId = yield* getOrgId;
    const sentAt = DateTime.formatIso(yield* DateTime.now);
    const properties = scrubSecrets({
      ...(enrichedEvent.properties ?? {}),
      ...(orgId ? { org_id: orgId } : {}),
    }) as Record<string, unknown>;
    const envelope: AnalyticsEnvelope = {
      event: enrichedEvent.name,
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
      sentAt,
      source: 'cli',
      distinctId,
      installId,
    };
    yield* enqueuePostHogEnvelope(envelope);
  }).pipe(Effect.catchAllCause(() => Effect.void));

export const emitPostHogAlias = (installId: string, apolloUserId: string) =>
  Effect.gen(function* () {
    if (!(yield* postHogEnabled)) {
      yield* telemetryDebugLog('alias_skip', { reason: 'disabled_or_missing_key', installId });
      return false;
    }

    const sentAt = DateTime.formatIso(yield* DateTime.now);
    const envelope: AnalyticsEnvelope = {
      event: POSTHOG_ALIAS_EVENT,
      properties: {
        distinct_id: apolloUserId,
        alias: installId,
        cli_version: constants.APP_VERSION,
      },
      sentAt,
      source: 'cli',
      distinctId: apolloUserId,
      installId,
    };
    return yield* enqueuePostHogEnvelope(envelope);
  }).pipe(Effect.catchAllCause(() => Effect.succeed(false)));

export const linkApolloIdentityForAnalytics = (apolloUserId: string, apiKey?: string) =>
  Effect.gen(function* () {
    const resolved = typeof apolloUserId === 'string' ? apolloUserId.trim() : '';
    if (resolved.length === 0) {
      return;
    }

    if (!(yield* postHogEnabled)) {
      yield* telemetryDebugLog('alias_skip', { reason: 'disabled_or_missing_key' });
      return;
    }

    const aliasToEmit = yield* withAnalyticsStateLock(
      Effect.gen(function* () {
        let state = yield* readAnalyticsState;
        let installId = yield* getOrCreateInstallIdUnlocked;

        // A second user on this machine must not merge into the previous user's
        // PostHog person: rotate to a fresh install_id before linking.
        const previousIdentity =
          state?.apollo_user_id ??
          state?.pending_alias_apollo_user_id ??
          state?.aliased_apollo_user_id;
        const identityChanged =
          typeof previousIdentity === 'string' &&
          previousIdentity.length > 0 &&
          previousIdentity !== resolved;
        if (identityChanged) {
          installId = yield* makeInstallId;
          yield* mergeAnalyticsStateUnlocked(installId, {
            install_id: installId,
            apollo_user_id: undefined,
            aliased_apollo_user_id: undefined,
            pending_alias_apollo_user_id: undefined,
            pending_alias_install_id: undefined,
            pending_alias_attempted_at: undefined,
            api_key_fingerprint: undefined,
          });
          state = yield* readAnalyticsState;
        }

        const fingerprint =
          typeof apiKey === 'string' && apiKey.length > 0
            ? yield* fingerprintApiKey(apiKey)
            : yield* getApiKeyFingerprint;
        if (state?.apollo_user_id !== resolved || state?.api_key_fingerprint !== fingerprint) {
          yield* mergeAnalyticsStateUnlocked(installId, {
            apollo_user_id: resolved,
            ...(fingerprint === null ? {} : { api_key_fingerprint: fingerprint }),
          });
        }

        state = yield* readAnalyticsState;
        if (state?.aliased_apollo_user_id === resolved) {
          return undefined;
        }
        if (
          state?.pending_alias_apollo_user_id === resolved &&
          state.pending_alias_install_id === installId
        ) {
          const attemptedAt = Date.parse(state.pending_alias_attempted_at ?? '');
          const now = yield* Clock.currentTimeMillis;
          if (Number.isFinite(attemptedAt) && now - attemptedAt < PENDING_ALIAS_RETRY_MS) {
            return undefined;
          }
        }

        yield* mergeAnalyticsStateUnlocked(installId, {
          pending_alias_apollo_user_id: resolved,
          pending_alias_install_id: installId,
          pending_alias_attempted_at: DateTime.formatIso(yield* DateTime.now),
        });
        return { installId, apolloUserId: resolved };
      })
    );
    if (!aliasToEmit) {
      return;
    }

    if (!(yield* emitPostHogAlias(aliasToEmit.installId, aliasToEmit.apolloUserId))) {
      yield* withAnalyticsStateLock(
        Effect.gen(function* () {
          const state = yield* readAnalyticsState;
          if (
            state?.pending_alias_install_id !== aliasToEmit.installId ||
            state.pending_alias_apollo_user_id !== aliasToEmit.apolloUserId
          ) {
            return;
          }
          yield* mergeAnalyticsStateUnlocked(aliasToEmit.installId, {
            pending_alias_apollo_user_id: undefined,
            pending_alias_install_id: undefined,
            pending_alias_attempted_at: undefined,
          });
        })
      );
    }
  }).pipe(Effect.catchAllCause(() => Effect.void));

export const clearApolloIdentityForAnalytics = withAnalyticsStateLock(
  Effect.gen(function* () {
    const state = yield* readAnalyticsState;
    if (!state?.install_id || !state.apollo_user_id) {
      return;
    }
    yield* mergeAnalyticsStateUnlocked(state.install_id, {
      apollo_user_id: undefined,
      api_key_fingerprint: undefined,
    });
  })
).pipe(Effect.catchAllCause(() => Effect.void));

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
    const { command, args } = yield* getDetachedWorkerSpawnArgs(
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

const settlePostHogAlias = (envelope: AnalyticsEnvelope, delivered: boolean) => {
  if (envelope.event !== POSTHOG_ALIAS_EVENT) {
    return Effect.void;
  }

  return withAnalyticsStateLock(
    Effect.gen(function* () {
      const state = yield* readAnalyticsState;
      if (
        state?.install_id !== envelope.installId ||
        state.pending_alias_install_id !== envelope.installId ||
        state.pending_alias_apollo_user_id !== envelope.distinctId
      ) {
        return;
      }

      yield* mergeAnalyticsStateUnlocked(envelope.installId, {
        ...(delivered ? { aliased_apollo_user_id: envelope.distinctId } : {}),
        pending_alias_apollo_user_id: undefined,
        pending_alias_install_id: undefined,
        pending_alias_attempted_at: undefined,
      });
    })
  ).pipe(Effect.catchAllCause(() => Effect.void));
};

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
    const delivered = yield* captureToPostHog(envelope).pipe(
      Effect.catchAllCause(cause =>
        telemetryDebugLog('delivery_error', { error: telemetryErrorDetails(cause) }).pipe(
          Effect.as(false)
        )
      )
    );
    yield* settlePostHogAlias(envelope, delivered);
    return true;
  }).pipe(Effect.catchAllCause(() => Effect.succeed(true)));
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
