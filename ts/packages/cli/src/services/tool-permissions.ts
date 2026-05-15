import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import open from 'open';
import { detectCliPlatform } from '@composio/cli-local-tools';
import { Effect, Option } from 'effect';
import { resolveCliConfigDirectorySync } from 'src/services/cli-user-config';
import { requestNativeUiPermissionDecision } from 'src/services/native-ui-sidecar';
import { ComposioUserContext } from 'src/services/user-context';

const ENHANCED_CONTROLS_UNSUPPORTED_PLATFORMS: ReadonlySet<string> = new Set(['darwin-x64']);

const isEnhancedControlsPlatformSupported = (): boolean =>
  !ENHANCED_CONTROLS_UNSUPPORTED_PLATFORMS.has(detectCliPlatform());

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
    const platformSupportsEnhancedControls = isEnhancedControlsPlatformSupported();
    const remoteEnhancedControlsEnabled = readEnhancedControlsFlag(config);
    if (remoteEnhancedControlsEnabled && !platformSupportsEnhancedControls) {
      yield* Effect.logDebug(
        'Enhanced controls are not supported on darwin-x64; disabling locally.'
      );
    }
    const enhancedControlsEnabled =
      remoteEnhancedControlsEnabled && platformSupportsEnhancedControls;
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

const approvalHtml = (params: { toolSlug: string; accountLabel?: string; token: string }) => {
  const toolSlug = escapeHtml(params.toolSlug);
  const accountLabel = params.accountLabel ? escapeHtml(params.accountLabel) : undefined;
  const token = encodeURIComponent(params.token);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Allow ${toolSlug}? · Composio CLI</title>
  <style>
    :root {
      color-scheme: light;
      --brand: #0007cd;
      --ink: #0a0a0a;
      --muted: rgba(0, 0, 0, 0.58);
      --border: rgba(0, 0, 0, 0.10);
      --panel: #ffffff;
      --chrome: #f6f6f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      overflow: hidden;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background:
        radial-gradient(circle at 18% 20%, rgba(0, 7, 205, 0.14), transparent 28rem),
        radial-gradient(circle at 82% 12%, rgba(0, 0, 0, 0.08), transparent 24rem),
        #fff;
      color: var(--ink);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.42;
      background-image: radial-gradient(rgba(0, 0, 0, 0.16) 0.7px, transparent 0.7px);
      background-size: 4px 4px;
      mix-blend-mode: multiply;
    }
    body::after {
      content: "";
      position: fixed;
      inset: auto -15vw -28vh -15vw;
      height: 46vh;
      pointer-events: none;
      background: linear-gradient(90deg, transparent, rgba(0, 7, 205, 0.12), transparent);
      filter: blur(34px);
      transform: rotate(-4deg);
    }
    main {
      position: relative;
      z-index: 1;
      width: min(720px, calc(100vw - 32px));
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 14px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.78);
      padding: 7px 9px;
      color: var(--muted);
      font-size: 12px;
      letter-spacing: -0.01em;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    }
    .badge {
      border: 1px solid var(--brand);
      border-radius: 3px;
      padding: 1px 5px;
      color: var(--brand);
      font-size: 10px;
      line-height: 1.4;
    }
    .terminal {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--panel);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.16);
    }
    .chrome {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      background: var(--chrome);
      padding: 10px 12px;
    }
    .dots { display: flex; gap: 6px; }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: #fff;
    }
    .titlebar {
      position: absolute;
      inset-inline: 72px;
      overflow: hidden;
      text-align: center;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: rgba(0, 0, 0, 0.48);
      font-size: 12px;
    }
    .content { padding: clamp(22px, 5vw, 42px); }
    .prompt {
      margin: 0 0 10px;
      color: var(--brand);
      font-size: clamp(13px, 2vw, 15px);
    }
    h1 {
      margin: 0;
      max-width: 620px;
      font-size: clamp(30px, 7vw, 58px);
      font-weight: 500;
      letter-spacing: -0.075em;
      line-height: 0.95;
    }
    .copy {
      max-width: 560px;
      margin: 18px 0 0;
      color: var(--muted);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 15px;
      line-height: 1.55;
    }
    .meta {
      display: grid;
      gap: 8px;
      margin-top: 24px;
      border: 1px solid var(--border);
      background: rgba(246, 246, 246, 0.72);
      padding: 14px;
      color: rgba(0, 0, 0, 0.52);
      font-size: 13px;
    }
    .meta strong { color: var(--ink); font-weight: 500; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 26px;
    }
    a {
      display: inline-flex;
      min-height: 42px;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      padding: 11px 14px;
      color: rgba(0, 0, 0, 0.72);
      text-decoration: none;
      transition: border-color 120ms ease, color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    a:hover { border-color: rgba(0, 7, 205, 0.34); color: var(--brand); transform: translateY(-1px); }
    a.primary {
      border-color: var(--brand);
      background: var(--brand);
      color: #fff;
      box-shadow: 0 12px 30px rgba(0, 7, 205, 0.20);
    }
    a.primary:hover { color: #fff; background: #0006b8; }
    a.danger:hover { border-color: rgba(220, 38, 38, 0.28); color: #dc2626; }
    .hint {
      margin: 18px 0 0;
      color: rgba(0, 0, 0, 0.36);
      font-size: 12px;
      line-height: 1.5;
    }
    @media (max-width: 560px) {
      body { padding: 16px; }
      .actions { flex-direction: column; }
      a { width: 100%; }
      .titlebar { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow"><span class="badge">CLI</span><span>Composio approval request</span></div>
    <section class="terminal" aria-labelledby="approval-title">
      <div class="chrome">
        <div class="dots" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
        <div class="titlebar">permission prompt</div>
      </div>
      <div class="content">
        <p class="prompt">$ composio execute ${toolSlug}</p>
        <h1 id="approval-title">Allow this tool call?</h1>
        <p class="copy">Composio CLI is requesting permission to execute <strong>${toolSlug}</strong>${accountLabel ? ` for <strong>${accountLabel}</strong>` : ''}. Choose how long this approval should last.</p>
        <div class="meta" aria-label="Request details">
          <div><strong>Tool</strong> · ${toolSlug}</div>
          <div><strong>Connection</strong> · ${accountLabel ?? 'default connection'}</div>
        </div>
        <div class="actions">
          <a class="primary" href="/allow-session?token=${token}">Allow for this session</a>
          <a href="/allow-once?token=${token}">Allow once</a>
          <a class="danger" href="/deny?token=${token}">Deny</a>
        </div>
        <p class="hint">This page is served from a temporary 127.0.0.1 callback owned by your CLI process. It will expire automatically.</p>
      </div>
    </section>
  </main>
</body>
</html>`;
};

const completionHtml = (decision: PermissionDecision) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Decision recorded · Composio CLI</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #fff; color: #0a0a0a; }
    main { width: min(520px, calc(100vw - 32px)); border: 1px solid rgba(0, 0, 0, 0.10); background: #fff; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.14); }
    .chrome { position: relative; border-bottom: 1px solid rgba(0, 0, 0, 0.10); background: #f6f6f6; padding: 10px 12px; color: rgba(0, 0, 0, 0.48); font-size: 12px; }
    .content { padding: 28px; }
    h1 { margin: 0; font-size: 28px; font-weight: 500; letter-spacing: -0.05em; }
    p { margin: 12px 0 0; color: rgba(0, 0, 0, 0.58); line-height: 1.5; }
    strong { color: #0007cd; font-weight: 500; }
  </style>
</head>
<body>
  <main>
    <div class="chrome">composio permission prompt</div>
    <div class="content">
      <h1>Decision recorded.</h1>
      <p>The CLI received <strong>${decision}</strong>. You can close this tab.</p>
    </div>
  </main>
</body>
</html>`;

const requestPermissionInBrowser = (params: {
  readonly toolSlug: string;
  readonly accountLabel?: string;
}): Promise<PermissionDecision> =>
  new Promise((resolve, reject) => {
    const token = crypto.randomUUID();
    let settled = false;

    const settle = (decision: PermissionDecision) => {
      if (settled) return;
      settled = true;
      server.close();
      resolve(decision);
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.searchParams.get('token') !== token) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
        return;
      }

      if (url.pathname === '/') {
        res
          .writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          .end(approvalHtml({ ...params, token }));
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
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }

      res
        .writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        .end(completionHtml(decision));
      settle(decision);
    });

    const timeout = setTimeout(() => settle('deny'), 30_000);

    server.on('close', () => clearTimeout(timeout));
    server.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    server.listen(0, '127.0.0.1', async () => {
      try {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : undefined;
        if (!port) throw new Error('Unable to allocate permission callback port.');
        await open(`http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, {
          wait: false,
        });
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
  // Prefer the bundled macOS native sidecar when it is available. The browser
  // prompt remains the cross-platform fallback and is only opened when the
  // native sidecar is missing or fails before returning a decision.
  const nativeDecision = await requestNativeUiPermissionDecision(params).catch(() => undefined);
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
