import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import open from 'open';
import { detectCliPlatform } from '@composio/cli-local-tools';
import { Effect, Option } from 'effect';
import { resolveCliConfigDirectorySync } from 'src/services/cli-user-config';
import {
  detectNativeUiCallerAgent,
  requestNativeUiPermissionDecision,
  type NativeUiCallerAgent,
} from 'src/services/native-ui-sidecar';
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

// Agent glyphs — same SVGs the macOS sidecar embeds (see
// `ts/packages/cli-local-tools/native/composio-native-ui/Sources/ComposioNativeUI/main.swift`).
// Kept verbatim so the browser fallback shows the same brand mark.
const AGENT_SVGS: Readonly<Record<NativeUiCallerAgent, string>> = {
  composio: `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_2367_5)"><path d="M91.7032 28.1801L35.3611 16.6572C31.6669 15.8988 28.1929 18.7367 28.1929 22.5043V49.1954V50.6144V77.3052C28.1929 81.0729 31.6669 83.9112 35.3611 83.1526L91.7032 71.6296" stroke="black" stroke-width="2.8556" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M48.1992 7.38531C48.1993 2.09223 53.6097 -1.44765 58.4546 0.57874L58.6851 0.679333L58.6902 0.68227L88.8308 14.6023C91.4759 15.7947 93.1338 18.4366 93.1346 21.3053V33.0975C93.1346 37.3994 89.4707 40.797 85.1902 40.4658L51.0547 37.918V61.8914L85.185 59.3435L85.585 59.323C89.6842 59.2231 93.1331 62.5334 93.109 66.6876V78.4797C93.109 81.3707 91.4075 83.9737 88.8105 85.1812L88.806 85.1827L58.691 99.0774L58.6917 99.0782C53.7808 101.351 48.1992 97.7714 48.1992 92.3759V81.1383C47.9779 81.2256 47.741 81.2834 47.4921 81.3015L30.8347 82.5007C29.4429 82.6007 28.2584 81.4977 28.2582 80.1023V67.7354C28.2583 67.256 28.4014 66.8063 28.6474 66.4277L14.9439 67.4513H14.9388C10.6701 67.7539 7.00001 64.3671 7 60.0823V39.7271C7.00031 35.4239 10.6671 32.0248 14.9491 32.3589H14.9483L28.3486 33.3589C28.2905 33.152 28.2583 32.9345 28.2582 32.7099V19.6826C28.2582 17.7807 29.9597 16.3299 31.8377 16.6304L47.6992 19.168C47.8735 19.1959 48.0404 19.2435 48.1992 19.3059V7.38531ZM85.4075 62.191H85.4023L51.0547 64.755V79.6601L90.2541 71.4669V66.6774L90.2496 66.435C90.1323 63.9438 87.9489 61.9928 85.4075 62.191ZM27.7075 36.1748C27.9471 36.5495 28.0863 36.9936 28.0864 37.4678V62.7813C28.0864 63.0748 28.0314 63.3559 27.9344 63.6169L48.1992 62.1044V37.7043L27.7075 36.1748ZM51.0547 35.0544L85.4023 37.6183L85.4075 37.6191L85.6511 37.6316C88.1632 37.6928 90.279 35.6595 90.279 33.0975V28.1405L51.0547 19.9411V35.0544Z" fill="black"/></g><defs><clipPath id="clip0_2367_5"><rect width="86.4662" height="100" fill="white" transform="translate(7)"/></clipPath></defs></svg>`,
  claude: `<svg preserveAspectRatio="xMidYMid" viewBox="0 0 256 257" xmlns="http://www.w3.org/2000/svg"><path fill="#D97757" d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/></svg>`,
  codex: `<svg fill="#0A0A0A" fill-rule="evenodd" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"/></svg>`,
  openclaw: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="openclaw__lobster-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff4d4d"/><stop offset="100%" stop-color="#991b1b"/></linearGradient></defs><path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#openclaw__lobster-gradient)"/><path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#openclaw__lobster-gradient)"/><path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#openclaw__lobster-gradient)"/><path d="M45 15 Q35 5 30 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/><path d="M75 15 Q85 5 90 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/><circle cx="45" cy="35" r="6" fill="#050810"/><circle cx="75" cy="35" r="6" fill="#050810"/><circle cx="46" cy="34" r="2.5" fill="#00e5cc"/><circle cx="76" cy="34" r="2.5" fill="#00e5cc"/></svg>`,
};

const AGENT_DISPLAY_NAMES: Readonly<Record<NativeUiCallerAgent, string>> = {
  composio: 'Composio',
  claude: 'Claude',
  codex: 'Codex',
  openclaw: 'OpenClaw',
};

// 8x8 Bayer matrix encoded as a tiny SVG, matching the sidecar's ordered-dither
// shader. Tiled across the card as a multiply-blended background.
const DITHER_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><g fill='%23000' fill-opacity='0.10'>${[
  [0, 0],
  [4, 0],
  [1, 0],
  [5, 0],
  [6, 1],
  [2, 1],
  [7, 1],
  [3, 1],
  [1, 2],
  [5, 2],
  [0, 2],
  [4, 2],
  [7, 3],
  [3, 3],
  [6, 3],
  [2, 3],
  [0, 4],
  [4, 4],
  [1, 4],
  [5, 5],
  [6, 5],
  [2, 5],
  [7, 5],
  [3, 5],
  [1, 6],
  [5, 6],
  [0, 6],
  [4, 6],
  [7, 7],
  [3, 7],
  [6, 7],
  [2, 7],
]
  .map(([x, y]) => `<rect x='${x}' y='${y}' width='1' height='1'/>`)
  .join('')}</g></svg>`;
const DITHER_DATA_URI = `url("data:image/svg+xml;utf8,${DITHER_SVG}")`;

const approvalHtml = (params: {
  toolSlug: string;
  accountLabel?: string;
  token: string;
  agent: NativeUiCallerAgent;
}) => {
  const toolSlug = escapeHtml(params.toolSlug);
  const account = escapeHtml(params.accountLabel ?? 'default connection');
  const token = encodeURIComponent(params.token);
  const agent = params.agent;
  const agentName = AGENT_DISPLAY_NAMES[agent];
  const agentSvg = AGENT_SVGS[agent];
  // The sidecar uses "wants to use TOOL" when an agent is detected and falls
  // back to "The composio cli wants to execute TOOL" in CLI mode. Mirror it.
  const titleBody =
    agent === 'composio'
      ? `The composio cli wants to execute <code>${toolSlug}</code>`
      : `<span class="agent-mark" aria-label="${agentName}">${agentSvg}</span><span class="agent-name">${agentName}</span> wants to use <code>${toolSlug}</code>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Allow ${toolSlug}? · Composio CLI</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #121212;
      --muted: #666666;
      --border: rgba(0, 0, 0, 0.10);
      --card: rgba(255, 255, 255, 0.86);
      --wash: rgba(255, 255, 255, 0.55);
      --primary: #171717;
      --primary-hover: #2e2e2e;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
      color: var(--ink);
      background: #d8d8d8;
    }
    .card {
      position: relative;
      width: min(520px, calc(100vw - 32px));
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      background: var(--card);
      backdrop-filter: blur(12px);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.6) inset,
        0 18px 50px rgba(0, 0, 0, 0.16),
        0 2px 6px rgba(0, 0, 0, 0.06);
    }
    /* Dithered Bayer pattern, multiplied beneath the wash — same recipe the
       Metal shader uses in the macOS sidecar. */
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image: ${DITHER_DATA_URI};
      background-size: 8px 8px;
      mix-blend-mode: multiply;
      opacity: 0.55;
      pointer-events: none;
    }
    /* Diagonal sine-wave hint (162°), pale and soft. */
    .card::after {
      content: "";
      position: absolute;
      inset: -20%;
      background: linear-gradient(
        108deg,
        transparent 30%,
        rgba(0, 0, 0, 0.07) 50%,
        transparent 70%
      );
      filter: blur(28px);
      pointer-events: none;
    }
    .card > * { position: relative; z-index: 1; }
    /* Translucent white wash that softens the dither beneath text. */
    .wash {
      position: absolute;
      inset: 0;
      background: var(--wash);
      pointer-events: none;
      z-index: 0;
    }
    .body {
      padding: 22px 22px 18px;
      display: grid;
      gap: 16px;
    }
    .title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 8px;
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.2px;
      line-height: 1.35;
      color: var(--ink);
    }
    .agent-mark {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
    }
    .agent-mark svg { width: 100%; height: 100%; }
    .agent-name { font-weight: 600; }
    .title code, .account code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-weight: 600;
      font-size: 0.92em;
    }
    .account {
      margin: 0;
      font-size: 12.5px;
      color: var(--muted);
      letter-spacing: -0.1px;
    }
    .account code {
      color: var(--ink);
      font-weight: 600;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 20px;
    }
    .logo {
      width: 32px;
      height: 32px;
      flex: none;
      opacity: 0.85;
    }
    .logo svg { width: 100%; height: 100%; }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .btn {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 30px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.55);
      color: var(--ink);
      font: 500 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
      letter-spacing: 0.1px;
      text-decoration: none;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .btn:hover { background: rgba(255, 255, 255, 0.85); }
    .btn:active { transform: scale(0.97); }
    .btn.primary {
      background: var(--primary);
      color: #fff;
      border-color: transparent;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0);
    }
    .btn.primary:hover {
      background: var(--primary-hover);
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
    }
    @media (max-width: 480px) {
      .row { flex-direction: column; align-items: stretch; }
      .actions { justify-content: stretch; }
      .btn { flex: 1; }
    }
  </style>
</head>
<body>
  <main class="card" aria-labelledby="approval-title">
    <div class="wash" aria-hidden="true"></div>
    <div class="body">
      <h1 id="approval-title" class="title">${titleBody}</h1>
      <p class="account">Account: <code>${account}</code></p>
      <div class="row">
        <span class="logo" aria-hidden="true">${AGENT_SVGS.composio}</span>
        <div class="actions">
          <a class="btn" href="/deny?token=${token}">Deny</a>
          <a class="btn" href="/allow-session?token=${token}">Allow for session</a>
          <a class="btn primary" href="/allow-once?token=${token}">Allow once</a>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`;
};

const COMPLETION_COPY: Readonly<
  Record<PermissionDecision, { readonly title: string; readonly body: string }>
> = {
  allow_once: {
    title: 'Allowed once',
    body: 'This tool call is going through now. We’ll ask again next time it’s used.',
  },
  allow_session: {
    title: 'Allowed for this session',
    body: 'This tool can run again for the rest of this CLI session without asking.',
  },
  deny: {
    title: 'Denied',
    body: 'The tool call was blocked. The agent will be told it was denied and can try something else.',
  },
};

const completionHtml = (decision: PermissionDecision) => {
  const { title, body } = COMPLETION_COPY[decision];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Composio CLI</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
      background: #d8d8d8;
      color: #121212;
    }
    main {
      width: min(420px, calc(100vw - 32px));
      border: 1px solid rgba(0, 0, 0, 0.10);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(12px);
      padding: 22px;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.12);
    }
    .logo { display: block; width: 26px; height: 26px; margin-bottom: 14px; opacity: 0.85; }
    .logo svg { width: 100%; height: 100%; display: block; }
    h1 { margin: 0 0 6px; font-size: 16px; font-weight: 600; letter-spacing: -0.2px; }
    p { margin: 0; font-size: 13px; line-height: 1.5; color: #555; }
    .hint { margin-top: 14px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <main>
    <span class="logo" aria-hidden="true">${AGENT_SVGS.composio}</span>
    <h1>${title}</h1>
    <p>${body}</p>
    <p class="hint">You can close this tab.</p>
  </main>
</body>
</html>`;
};

const requestPermissionInBrowser = (params: {
  readonly toolSlug: string;
  readonly accountLabel?: string;
  readonly agent: NativeUiCallerAgent;
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
  return requestPermissionInBrowser({ ...params, agent: detectNativeUiCallerAgent() });
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
