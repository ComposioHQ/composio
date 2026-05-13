import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import open from 'open';
import { Effect, Option } from 'effect';
import { resolveCliConfigDirectorySync } from 'src/services/cli-user-config';
import { requestNativeUiPermissionDecision } from 'src/services/native-ui-sidecar';
import { ComposioUserContext } from 'src/services/user-context';

export const ENHANCED_LINK_URL_OVERWRITE = 'https://connect.composio.dev/enhanced';

const CACHE_FILE_NAME = 'tool-permissions-cache.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
const NO_CONNECTED_ACCOUNT = '__none__';

export type PermissionDefaultMode = 'allow_all' | 'ask_every_call' | 'ask_once_per_session';
export type PermissionOverrideState = 'always_allow' | 'always_deny' | 'ask_once' | 'ask_always';
export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export interface ToolRouterPermissionsConfig {
  readonly default: PermissionDefaultMode;
  readonly overrides?: Readonly<Record<string, PermissionOverrideState>>;
}

export interface ConsumerPermissionSnapshot {
  readonly orgId: string;
  readonly projectId: string;
  readonly consumerUserId: string;
  readonly enhancedControlsEnabled: boolean;
  readonly permissions?: ToolRouterPermissionsConfig;
  readonly connectedAccountIds: ReadonlyArray<string>;
  readonly fetchedAt: number;
}

interface CacheFile {
  readonly entries: Readonly<Record<string, ConsumerPermissionSnapshot>>;
}

interface PermissionResolveResponse {
  readonly experimental?: {
    readonly permissions?: ToolRouterPermissionsConfig;
  };
}

interface ConsumerConfigResponse {
  readonly enhanced_controls?: boolean;
  readonly enhancedControls?: boolean;
}

interface GateParams {
  readonly toolSlug: string;
  readonly connectedAccountId?: string;
  readonly connectedAccountWordId?: string;
  readonly snapshot?: ConsumerPermissionSnapshot;
}

const sessionAllowCache = new Set<string>();

const cachePath = () => path.join(resolveCliConfigDirectorySync(), CACHE_FILE_NAME);
const cacheKey = (params: { orgId: string; projectId: string; consumerUserId: string }) =>
  [params.orgId, params.projectId, params.consumerUserId].join(':');
const normalizeBaseUrl = (baseURL: string) => baseURL.replace(/\/$/, '');

const uniq = (values: ReadonlyArray<string | undefined>) => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];

const readCacheFile = async (): Promise<CacheFile> => {
  try {
    const raw = await fs.readFile(cachePath(), 'utf8');
    const parsed = JSON.parse(raw) as CacheFile;
    return parsed && typeof parsed === 'object' && parsed.entries ? parsed : { entries: {} };
  } catch {
    return { entries: {} };
  }
};

const writeCacheEntry = async (entry: ConsumerPermissionSnapshot): Promise<void> => {
  await fs.mkdir(path.dirname(cachePath()), { recursive: true });
  const current = await readCacheFile();
  await fs.writeFile(
    cachePath(),
    `${JSON.stringify(
      {
        entries: {
          ...current.entries,
          [cacheKey(entry)]: entry,
        },
      } satisfies CacheFile,
      null,
      2
    )}\n`,
    'utf8'
  );
};

const readCachedEntry = async (params: {
  orgId: string;
  projectId: string;
  consumerUserId: string;
}): Promise<ConsumerPermissionSnapshot | undefined> => {
  const cache = await readCacheFile();
  return cache.entries[cacheKey(params)];
};

const isFreshForAccounts = (
  entry: ConsumerPermissionSnapshot | undefined,
  connectedAccountIds: ReadonlyArray<string>
): entry is ConsumerPermissionSnapshot => {
  if (!entry) return false;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return false;
  const cachedIds = new Set(entry.connectedAccountIds);
  return connectedAccountIds.every(id => cachedIds.has(id));
};

const readEnhancedControlsFlag = (payload: ConsumerConfigResponse): boolean =>
  payload.enhanced_controls === true || payload.enhancedControls === true;

const fetchJson = async <T>({
  baseURL,
  apiKey,
  orgId,
  projectId,
  path,
  method = 'GET',
  body,
}: {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly path: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
}): Promise<T> => {
  const response = await fetch(`${normalizeBaseUrl(baseURL)}${path}`, {
    method,
    redirect: 'error',
    headers: {
      'x-user-api-key': apiKey,
      'x-org-id': orgId,
      'x-project-id': projectId,
      'User-Agent': '@composio/cli',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
};

export const refreshConsumerPermissionSnapshot = (params: {
  readonly orgId: string;
  readonly projectId: string;
  readonly consumerUserId: string;
  readonly connectedAccountIds?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    if (!apiKey) return undefined;

    const connectedAccountIds = uniq(params.connectedAccountIds ?? []);
    const config = yield* Effect.tryPromise(() =>
      fetchJson<ConsumerConfigResponse>({
        baseURL: userContext.data.baseURL,
        apiKey,
        orgId: params.orgId,
        projectId: params.projectId,
        path: '/api/v3.1/org/consumer/config',
      })
    );
    const enhancedControlsEnabled = readEnhancedControlsFlag(config);
    const permissions =
      enhancedControlsEnabled && connectedAccountIds.length > 0
        ? yield* Effect.tryPromise(() =>
            fetchJson<PermissionResolveResponse>({
              baseURL: userContext.data.baseURL,
              apiKey,
              orgId: params.orgId,
              projectId: params.projectId,
              path: '/api/v3.1/consumer/permissions/resolve',
              method: 'POST',
              body: {
                connected_account_ids: connectedAccountIds,
                default: 'ask_every_call',
              },
            })
          ).pipe(Effect.map(response => response.experimental?.permissions))
        : undefined;

    const snapshot: ConsumerPermissionSnapshot = {
      orgId: params.orgId,
      projectId: params.projectId,
      consumerUserId: params.consumerUserId,
      enhancedControlsEnabled,
      permissions,
      connectedAccountIds,
      fetchedAt: Date.now(),
    };
    yield* Effect.tryPromise(() => writeCacheEntry(snapshot));
    return snapshot;
  }).pipe(
    Effect.catchAll(error =>
      Effect.gen(function* () {
        yield* Effect.logDebug('Failed to refresh consumer permission cache', error);
        return undefined;
      })
    )
  );

export const getConsumerPermissionSnapshot = (params: {
  readonly orgId: string;
  readonly projectId: string;
  readonly consumerUserId: string;
  readonly connectedAccountIds?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const connectedAccountIds = uniq(params.connectedAccountIds ?? []);
    const cached = yield* Effect.tryPromise(() => readCachedEntry(params)).pipe(
      Effect.catchAll(() => Effect.succeed(undefined))
    );

    if (isFreshForAccounts(cached, connectedAccountIds)) {
      yield* refreshConsumerPermissionSnapshot({ ...params, connectedAccountIds }).pipe(
        Effect.forkDaemon,
        Effect.catchAll(() => Effect.void)
      );
      return cached;
    }

    const refreshed = yield* refreshConsumerPermissionSnapshot({ ...params, connectedAccountIds });
    return refreshed ?? cached;
  });

const permissionField = (toolSlug: string, connectedAccountId?: string) =>
  `${toolSlug}:${connectedAccountId ?? NO_CONNECTED_ACCOUNT}`;
const accountPermissionField = (connectedAccountId?: string) =>
  `*:${connectedAccountId ?? NO_CONNECTED_ACCOUNT}`;

const resolvePermissionState = (
  params: GateParams
): PermissionOverrideState | PermissionDefaultMode => {
  const permissions = params.snapshot?.permissions;
  const override =
    permissions?.overrides?.[permissionField(params.toolSlug, params.connectedAccountId)] ??
    permissions?.overrides?.[accountPermissionField(params.connectedAccountId)];
  return override ?? permissions?.default ?? 'allow_all';
};

const sessionCacheKey = (params: GateParams) =>
  `${params.snapshot?.orgId ?? 'unknown'}:${params.snapshot?.projectId ?? 'unknown'}:${params.snapshot?.consumerUserId ?? 'unknown'}:${permissionField(params.toolSlug, params.connectedAccountId)}`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

const html = (params: { toolSlug: string; accountLabel?: string; port: number; token: string }) => {
  const toolSlug = escapeHtml(params.toolSlug);
  const accountLabel = params.accountLabel ? escapeHtml(params.accountLabel) : undefined;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Allow ${toolSlug}?</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at 20% 20%, #7c3aed33, transparent 35%), #080812; color: white; }
    main { width: min(520px, calc(100vw - 32px)); padding: 28px; border: 1px solid #ffffff22; border-radius: 24px; background: #ffffff12; box-shadow: 0 24px 80px #0008; backdrop-filter: blur(24px); }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { color: #d6d6e7; line-height: 1.5; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 22px; }
    a { color: white; text-decoration: none; padding: 11px 14px; border-radius: 999px; background: #ffffff1c; }
    a.primary { background: #7c3aed; }
  </style>
</head>
<body>
  <main>
    <h1>Allow ${toolSlug}?</h1>
    <p>Composio CLI is requesting permission to execute this tool${accountLabel ? ` for ${accountLabel}` : ''}.</p>
    <div class="actions">
      <a class="primary" href="http://127.0.0.1:${params.port}/allow-session?token=${params.token}">Allow for this session</a>
      <a href="http://127.0.0.1:${params.port}/allow-once?token=${params.token}">Allow once</a>
      <a href="http://127.0.0.1:${params.port}/deny?token=${params.token}">Deny</a>
    </div>
  </main>
</body>
</html>`;
};

const requestPermissionInBrowser = (params: {
  readonly toolSlug: string;
  readonly accountLabel?: string;
}): Promise<PermissionDecision> =>
  new Promise((resolve, reject) => {
    const token = crypto.randomUUID();
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.searchParams.get('token') !== token) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const decision =
        url.pathname === '/allow-session'
          ? 'allow_session'
          : url.pathname === '/allow-once'
            ? 'allow_once'
            : url.pathname === '/deny'
              ? 'deny'
              : undefined;
      if (!decision) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>You can close this tab.</p>');
      server.close();
      resolve(decision);
    });

    const timeout = setTimeout(() => {
      server.close();
      resolve('deny');
    }, 30_000);

    server.on('close', () => clearTimeout(timeout));
    server.on('error', reject);
    server.listen(0, '127.0.0.1', async () => {
      try {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : undefined;
        if (!port) throw new Error('Unable to allocate permission callback port.');
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'composio-permission-'));
        const filePath = path.join(dir, 'index.html');
        await fs.writeFile(filePath, html({ ...params, port, token }), 'utf8');
        await open(filePath);
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });

const requestPermissionDecision = async (params: {
  readonly toolSlug: string;
  readonly accountLabel?: string;
}): Promise<PermissionDecision> => {
  const nativeDecision = await requestNativeUiPermissionDecision(params);
  if (nativeDecision === 'allow_once' || nativeDecision === 'allow_session') return nativeDecision;
  if (nativeDecision === 'deny' || nativeDecision === 'dismissed') return 'deny';
  return requestPermissionInBrowser(params);
};

export const gateToolExecution = (params: GateParams) =>
  Effect.gen(function* () {
    if (!params.snapshot?.enhancedControlsEnabled || !params.snapshot.permissions) return;

    const state = resolvePermissionState(params);
    if (state === 'allow_all' || state === 'always_allow') return;
    if (state === 'always_deny') {
      return yield* Effect.fail(
        new Error(`Tool execution denied by permissions: ${params.toolSlug}`)
      );
    }

    const cacheKey = sessionCacheKey(params);
    const readsSessionCache = state === 'ask_once' || state === 'ask_once_per_session';
    if (readsSessionCache && sessionAllowCache.has(cacheKey)) return;

    const decision = yield* Effect.tryPromise(() =>
      requestPermissionDecision({
        toolSlug: params.toolSlug,
        accountLabel: params.connectedAccountWordId,
      })
    );

    if (decision === 'deny') {
      return yield* Effect.fail(new Error(`Tool execution denied by user: ${params.toolSlug}`));
    }
    if (decision === 'allow_session' || (readsSessionCache && decision === 'allow_once')) {
      sessionAllowCache.add(cacheKey);
    }
  });
