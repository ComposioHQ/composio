import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { Effect } from 'effect';
import type { AnalyticsEnvelope, TrackEvent } from './types';
import * as constants from 'src/constants';

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

const truthy = (value: string | undefined): boolean =>
  value === '1' || value === 'true' || value === 'yes' || value === 'on';

const isTelemetryDebugEnabled = (): boolean => truthy(process.env[TELEMETRY_DEBUG_ENV_VAR]);

const telemetryDebugLog = (label: string, payload: Record<string, unknown>) => {
  if (!isTelemetryDebugEnabled()) {
    return;
  }

  process.stderr.write(
    `[telemetry-debug] ${JSON.stringify(
      {
        label,
        ...payload,
      },
      null,
      2
    )}\n`
  );
};

const analyticsDir = () => path.join(os.homedir(), COMPOSIO_DIR);
const analyticsStatePath = () => path.join(analyticsDir(), ANALYTICS_STATE_FILE_NAME);
const userConfigPath = () => path.join(analyticsDir(), constants.USER_CONFIG_FILE_NAME);
const cacheDir = () =>
  process.env.COMPOSIO_CACHE_DIR?.trim() ||
  process.env.CACHE_DIR?.trim() ||
  path.join(os.homedir(), constants.USER_COMPOSIO_DIR);
const consumerShortTermCachePath = () => path.join(cacheDir(), CONSUMER_SHORT_TERM_CACHE_FILE_NAME);

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

const ensureAnalyticsDir = () => {
  try {
    fs.mkdirSync(analyticsDir(), { recursive: true });
  } catch {
    // Non-fatal — analytics directory creation may fail in sandboxed environments.
  }
};

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
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
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

const getOrCreateInstallId = (): string => {
  try {
    ensureAnalyticsDir();
    const filePath = analyticsStatePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as { install_id?: unknown };
      if (typeof parsed.install_id === 'string' && parsed.install_id.length > 0) {
        return parsed.install_id;
      }
    }
    const installId = crypto.randomUUID();
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          install_id: installId,
          created_at: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
    return installId;
  } catch {
    return crypto.randomUUID();
  }
};

const getHashedApiKeyDistinctId = (): string | null => {
  const envApiKey = process.env.COMPOSIO_USER_API_KEY?.trim();
  if (envApiKey) {
    return `user_${hashString(envApiKey)}`;
  }

  try {
    const raw = fs.readFileSync(userConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as { api_key?: unknown };
    if (typeof parsed.api_key === 'string' && parsed.api_key.trim().length > 0) {
      return `user_${hashString(parsed.api_key.trim())}`;
    }
  } catch {
    // Ignore user config read failures.
  }

  return null;
};

const getDistinctId = (): string => getHashedApiKeyDistinctId() ?? `anon_${getOrCreateInstallId()}`;

const getUserApiKey = (): string | null => {
  const envApiKey = process.env.COMPOSIO_USER_API_KEY?.trim();
  if (envApiKey) {
    return envApiKey;
  }

  try {
    const raw = fs.readFileSync(userConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as { api_key?: unknown };
    if (typeof parsed.api_key === 'string' && parsed.api_key.trim().length > 0) {
      return parsed.api_key.trim();
    }
  } catch {
    // Ignore user config read failures.
  }

  return null;
};

const cwdHash = (cwd: string): string => djb2Hash(cwd).toString(36);

export const getCurrentCwdSessionId = (): string | undefined => {
  try {
    const raw = fs.readFileSync(consumerShortTermCachePath(), 'utf8');
    const parsed = JSON.parse(raw) as ConsumerShortTermCacheState;
    const currentCwdHash = cwdHash(process.cwd());
    const now = Date.now();
    let best: { id: string; expiresAtMs: number } | undefined;

    for (const entry of Object.values(parsed)) {
      const session = entry.probablyMyCliSessionsByCwdHash?.[currentCwdHash];
      if (!session?.id) continue;
      const expiresAtMs = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) continue;
      if (!best || expiresAtMs > best.expiresAtMs) {
        best = { id: session.id, expiresAtMs };
      }
    }

    return best?.id;
  } catch {
    return undefined;
  }
};

const withCliSessionId = (event: TrackEvent): TrackEvent => {
  if (!event) return event;
  const cliSessionId = getCurrentCwdSessionId();
  return {
    ...event,
    properties: {
      ...(event.properties ?? {}),
      cli_version: event.properties?.cli_version ?? constants.APP_VERSION,
      ...(cliSessionId ? { cli_session_id: cliSessionId } : {}),
    },
  };
};

export const readApiBaseUrl = (): string | null => {
  const envBaseUrl = process.env.COMPOSIO_BASE_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/+$/u, '');
  }

  try {
    const raw = fs.readFileSync(userConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as { base_url?: unknown };
    if (typeof parsed.base_url === 'string' && parsed.base_url.trim().length > 0) {
      return parsed.base_url.trim().replace(/\/+$/u, '');
    }
  } catch {
    // Ignore user config read failures.
  }

  return null;
};

const getAnalyticsEndpoint = (): string | null => {
  const baseUrl = readApiBaseUrl();
  return baseUrl ? `${baseUrl}${CLI_ANALYTICS_PATH}` : null;
};

const getCliCodactFailuresEndpoint = (): string | null => {
  const baseUrl = readApiBaseUrl();
  return baseUrl ? `${baseUrl}${CLI_CODACT_FAILURES_PATH}` : null;
};

export const shouldDisableAnalytics = (): boolean =>
  truthy(process.env.COMPOSIO_CLI_TELEMETRY_DISABLED) ||
  truthy(process.env.TELEMETRY_DISABLED) ||
  truthy(process.env.COMPOSIO_DISABLE_TELEMETRY) ||
  process.env.NODE_ENV === 'test' ||
  process.env.CI === 'true';

const getWorkerSpawnArgs = (encodedPayload: string): { command: string; args: string[] } => {
  const maybeScriptPath = process.argv[1];
  const scriptPathLooksReal =
    typeof maybeScriptPath === 'string' &&
    maybeScriptPath.length > 0 &&
    fs.existsSync(maybeScriptPath) &&
    /\.(?:[cm]?[jt]s|mjs|mts|cts)$/u.test(maybeScriptPath);

  return scriptPathLooksReal
    ? {
        command: process.execPath,
        args: [maybeScriptPath, INTERNAL_ANALYTICS_WORKER_FLAG, encodedPayload],
      }
    : {
        command: process.execPath,
        args: [INTERNAL_ANALYTICS_WORKER_FLAG, encodedPayload],
      };
};

const captureToComposioAnalytics = async (envelope: AnalyticsEnvelope): Promise<void> => {
  const endpoint = getAnalyticsEndpoint();
  if (!endpoint || shouldDisableAnalytics()) {
    telemetryDebugLog('delivery_skipped', {
      reason: shouldDisableAnalytics() ? 'disabled' : 'missing_endpoint',
      endpoint,
      eventName: envelope.event,
    });
    return;
  }

  const userApiKey = getUserApiKey();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-composio-analytics-source': 'cli',
      ...(userApiKey ? { 'x-user-api-key': userApiKey } : {}),
    },
    body: JSON.stringify(envelope),
  });
  const responseBody =
    !response.ok && isTelemetryDebugEnabled() ? await response.text() : undefined;

  telemetryDebugLog(response.ok ? 'delivery_succeeded' : 'delivery_failed', {
    endpoint,
    eventName: envelope.event,
    status: response.status,
    ok: response.ok,
    responseBody: responseBody?.slice(0, 1000),
  });
};

export const createCliCodactFailureBody = (
  failure: CliCodactFailure
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
    id: getCurrentCwdSessionId(),
    cli_version: constants.APP_VERSION,
    invocation_origin: process.env.COMPOSIO_CLI_INVOCATION_ORIGIN ?? 'cli',
    parent_run_id: process.env.COMPOSIO_CLI_PARENT_RUN_ID,
    ...(failure.session ?? {}),
  },
  ...(failure.requestId ? { request_id: failure.requestId } : {}),
});

const captureToComposioCodactFailures = async (failure: CliCodactFailure): Promise<void> => {
  const endpoint = getCliCodactFailuresEndpoint();
  if (!endpoint || shouldDisableAnalytics()) {
    telemetryDebugLog('codact_delivery_skipped', {
      reason: shouldDisableAnalytics() ? 'disabled' : 'missing_endpoint',
      endpoint,
      failureType: failure.failureType,
    });
    return;
  }

  const userApiKey = getUserApiKey();
  if (!userApiKey) {
    telemetryDebugLog('codact_delivery_skipped', {
      reason: 'missing_user_api_key',
      endpoint,
      failureType: failure.failureType,
    });
    return;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-api-key': userApiKey,
    },
    body: JSON.stringify(createCliCodactFailureBody(failure)),
  });
  const responseBody =
    !response.ok && isTelemetryDebugEnabled() ? await response.text() : undefined;

  telemetryDebugLog(response.ok ? 'codact_delivery_succeeded' : 'codact_delivery_failed', {
    endpoint,
    failureType: failure.failureType,
    status: response.status,
    ok: response.ok,
    responseBody: responseBody?.slice(0, 1000),
  });
};

export const trackCliEvent = (event: TrackEvent): void => {
  const endpoint = getAnalyticsEndpoint();
  if (!event) {
    return;
  }

  if (shouldDisableAnalytics() || !endpoint) {
    telemetryDebugLog('skip', {
      reason: shouldDisableAnalytics() ? 'disabled' : 'missing_endpoint',
      eventName: event.name,
      endpoint,
    });
    return;
  }

  try {
    const enrichedEvent = withCliSessionId(event);
    if (!enrichedEvent) {
      return;
    }
    const installId = getOrCreateInstallId();
    const distinctId = getDistinctId();
    const envelope: AnalyticsEnvelope = {
      event: enrichedEvent.name,
      ...(enrichedEvent.properties ? { properties: enrichedEvent.properties } : {}),
      sentAt: new Date().toISOString(),
      source: 'cli',
      distinctId,
      installId,
    };
    telemetryDebugLog('enqueue', {
      endpoint,
      envelope,
    });
    const encodedPayload = encodeBase64Url(JSON.stringify(envelope));
    const { command, args } = getWorkerSpawnArgs(encodedPayload);
    const child = spawn(command, args, {
      detached: true,
      stdio: isTelemetryDebugEnabled() ? ['ignore', 'ignore', 'inherit'] : 'ignore',
      env: {
        ...process.env,
        COMPOSIO_CLI_ANALYTICS_WORKER: '1',
      },
    });
    child.unref();
  } catch {
    // Analytics must never break CLI execution.
  }
};

export const trackCliEventEffect = (event: TrackEvent) => Effect.sync(() => trackCliEvent(event));

export const trackCliCodactFailure = (failure: CliCodactFailure): void => {
  const endpoint = getCliCodactFailuresEndpoint();
  const userApiKey = getUserApiKey();
  if (shouldDisableAnalytics() || !endpoint || !userApiKey) {
    telemetryDebugLog('codact_skip', {
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

  try {
    const encodedPayload = encodeBase64Url(JSON.stringify(createCliCodactFailureBody(failure)));
    const { command, args } = getWorkerSpawnArgsForFlag(
      INTERNAL_CODACT_FAILURE_WORKER_FLAG,
      encodedPayload
    );
    const child = spawn(command, args, {
      detached: true,
      stdio: isTelemetryDebugEnabled() ? ['ignore', 'ignore', 'inherit'] : 'ignore',
      env: {
        ...process.env,
        COMPOSIO_CLI_ANALYTICS_WORKER: '1',
      },
    });
    child.unref();
  } catch {
    // Best-effort — codact failure tracking must never break CLI execution.
  }
};

export const trackCliCodactFailureEffect = (failure: CliCodactFailure) =>
  Effect.sync(() => trackCliCodactFailure(failure));

const getWorkerSpawnArgsForFlag = (
  workerFlag: string,
  encodedPayload: string
): { command: string; args: string[] } => {
  const maybeScriptPath = process.argv[1];
  const scriptPathLooksReal =
    typeof maybeScriptPath === 'string' &&
    maybeScriptPath.length > 0 &&
    fs.existsSync(maybeScriptPath) &&
    /\.(?:[cm]?[jt]s|mjs|mts|cts)$/u.test(maybeScriptPath);

  return scriptPathLooksReal
    ? {
        command: process.execPath,
        args: [maybeScriptPath, workerFlag, encodedPayload],
      }
    : {
        command: process.execPath,
        args: [workerFlag, encodedPayload],
      };
};

const getWorkerFlagIndex = (argv: ReadonlyArray<string>, flag: string): number =>
  argv.findIndex(token => token === flag);

export const isBackgroundWorkerInvocation = (argv: ReadonlyArray<string>): boolean =>
  getWorkerFlagIndex(argv, INTERNAL_ANALYTICS_WORKER_FLAG) >= 0 ||
  getWorkerFlagIndex(argv, INTERNAL_CODACT_FAILURE_WORKER_FLAG) >= 0;

export const runBackgroundWorkerFromArgv = async (argv: ReadonlyArray<string>): Promise<void> => {
  const analyticsFlagIndex = getWorkerFlagIndex(argv, INTERNAL_ANALYTICS_WORKER_FLAG);
  if (analyticsFlagIndex >= 0) {
    const encodedPayload = argv[analyticsFlagIndex + 1];
    if (!encodedPayload) {
      return;
    }

    try {
      const decoded = decodeBase64Url(encodedPayload);
      const envelope = JSON.parse(decoded) as AnalyticsEnvelope;
      if (typeof envelope?.event !== 'string' || envelope.event.length === 0) {
        return;
      }
      await captureToComposioAnalytics(envelope);
    } catch (error) {
      telemetryDebugLog('delivery_error', {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
    }
    return;
  }

  const codactFlagIndex = getWorkerFlagIndex(argv, INTERNAL_CODACT_FAILURE_WORKER_FLAG);
  if (codactFlagIndex < 0) {
    return;
  }

  const encodedPayload = argv[codactFlagIndex + 1];
  if (!encodedPayload) {
    return;
  }

  try {
    const decoded = decodeBase64Url(encodedPayload);
    const body = JSON.parse(decoded) as ReturnType<typeof createCliCodactFailureBody>;
    if (
      body?.failure_type !== 'wrong_tool_slug' &&
      body?.failure_type !== 'wrong_tool_input_param'
    ) {
      return;
    }

    await captureToComposioCodactFailures({
      failureType: body.failure_type,
      toolInfo: body.tool_info,
      ctx: body.ctx,
      session: body.session,
      requestId: body.request_id,
    });
  } catch (error) {
    telemetryDebugLog('codact_delivery_error', {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
  }
};
