import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { Effect } from 'effect';
import type { AnalyticsEnvelope, TrackEvent } from './types';

const INTERNAL_ANALYTICS_WORKER_FLAG = '__analytics-worker';
const COMPOSIO_DIR = '.composio';
const USER_CONFIG_FILE_NAME = 'user-config.json';
const ANALYTICS_STATE_FILE_NAME = 'analytics.json';
const CLI_ANALYTICS_PATH = '/api/cli/analytics';

const truthy = (value: string | undefined): boolean =>
  value === '1' || value === 'true' || value === 'yes' || value === 'on';

const analyticsDir = () => path.join(os.homedir(), COMPOSIO_DIR);
const analyticsStatePath = () => path.join(analyticsDir(), ANALYTICS_STATE_FILE_NAME);
const userConfigPath = () => path.join(analyticsDir(), USER_CONFIG_FILE_NAME);

const ensureAnalyticsDir = () => {
  fs.mkdirSync(analyticsDir(), { recursive: true });
};

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
    return `user_${crypto.createHash('sha256').update(envApiKey).digest('hex')}`;
  }

  try {
    const raw = fs.readFileSync(userConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as { api_key?: unknown };
    if (typeof parsed.api_key === 'string' && parsed.api_key.trim().length > 0) {
      return `user_${crypto.createHash('sha256').update(parsed.api_key.trim()).digest('hex')}`;
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

const readApiBaseUrl = (): string | null => {
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

const shouldDisableAnalytics = (): boolean =>
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
    return;
  }

  const userApiKey = getUserApiKey();

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-composio-analytics-source': 'cli',
      ...(userApiKey ? { 'x-user-api-key': userApiKey } : {}),
    },
    body: JSON.stringify(envelope),
  });
};

export const trackCliEvent = (event: TrackEvent): void => {
  if (!event || shouldDisableAnalytics() || !getAnalyticsEndpoint()) {
    return;
  }

  try {
    const installId = getOrCreateInstallId();
    const distinctId = getDistinctId();
    const envelope: AnalyticsEnvelope = {
      event,
      sentAt: new Date().toISOString(),
      source: 'cli',
      distinctId,
      installId,
    };
    const encodedPayload = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
    const { command, args } = getWorkerSpawnArgs(encodedPayload);
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
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

export const isAnalyticsWorkerInvocation = (argv: ReadonlyArray<string>): boolean =>
  argv[2] === INTERNAL_ANALYTICS_WORKER_FLAG;

export const runAnalyticsWorkerFromArgv = async (argv: ReadonlyArray<string>): Promise<void> => {
  const encodedPayload = argv[3];
  if (!encodedPayload) {
    return;
  }

  try {
    const decoded = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const envelope = JSON.parse(decoded) as AnalyticsEnvelope;
    if (!envelope?.event?.name) {
      return;
    }
    await captureToComposioAnalytics(envelope);
  } catch {
    // Analytics must never break CLI execution.
  }
};
