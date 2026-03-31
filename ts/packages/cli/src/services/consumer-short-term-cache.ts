import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { Effect, Option } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { NodeProcess } from 'src/services/node-process';
import {
  ComposioToolkitsRepository,
  ComposioClientSingleton,
  getConsumerConnectedToolkits,
  resolveConsumerProject,
} from 'src/services/composio-clients';
import { resolveCommandProject } from 'src/services/command-project';
import { resolveToolRouterSessionConnections } from 'src/services/tool-router-session-connections';
import { ComposioUserContext } from 'src/services/user-context';

const CACHE_FILE = 'consumer-short-term-cache.json';
const CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_SESSION_EXTENSION_MS = 5 * 60 * 1000;

export type ConsumerToolRouterAuthConfigMappings = {
  readonly authConfigs?: Record<string, string>;
};

type CacheEntry = {
  readonly toolkits: ReadonlyArray<string>;
  readonly expiresAt: string;
  readonly toolRouterAuthConfigs?: ConsumerToolRouterAuthConfigMappings;
  readonly probablyMyCliSessionsByCwdHash?: Record<
    string,
    {
      readonly id: string;
      readonly expiresAt: string;
    }
  >;
};

type CacheState = Record<string, CacheEntry>;

const cacheKey = (orgId: string, consumerUserId: string) => `${orgId}:${consumerUserId}`;

const cachePath = (cacheDir: string) => path.join(cacheDir, CACHE_FILE);

const cwdHash = (cwd: string): string => {
  let hash = 5381;
  for (let i = 0; i < cwd.length; i += 1) {
    hash = (hash * 33) ^ cwd.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(36);
};

const createProbablyMyCliSessionId = (cwd: string): string => {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `cli_s_${cwdHash(cwd)}_${random}`;
};

const resolveSearchSessionMetadata = (params: {
  readonly currentEntry?: CacheEntry;
  readonly cwd: string;
}) => {
  const now = Date.now();
  const currentCwdHash = cwdHash(params.cwd);
  const previousMap = {
    ...(params.currentEntry?.probablyMyCliSessionsByCwdHash ?? {}),
  };

  const probablyMyCliSessionsByCwdHash = Object.fromEntries(
    Object.entries(previousMap).filter(([, session]) => {
      const expiresAtMs = Date.parse(session.expiresAt);
      return Number.isFinite(expiresAtMs) && expiresAtMs > now;
    })
  );

  const currentSession = probablyMyCliSessionsByCwdHash[currentCwdHash];
  if (currentSession) {
    probablyMyCliSessionsByCwdHash[currentCwdHash] = {
      id: currentSession.id,
      expiresAt: new Date(
        Math.max(now, Date.parse(currentSession.expiresAt)) + SEARCH_SESSION_EXTENSION_MS
      ).toISOString(),
    };
  } else {
    probablyMyCliSessionsByCwdHash[currentCwdHash] = {
      id: createProbablyMyCliSessionId(params.cwd),
      expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
    };
  }

  return {
    probablyMyCliSessionsByCwdHash,
  };
};

const readCache = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    const filePath = cachePath(cacheDir);
    if (!(yield* fs.exists(filePath))) {
      return {} satisfies CacheState;
    }
    const raw = yield* fs.readFileString(filePath, 'utf8');
    return yield* Effect.sync(() => JSON.parse(raw) as CacheState).pipe(
      Effect.catchAll(() => Effect.succeed({} satisfies CacheState))
    );
  });

const writeCache = (state: CacheState) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    yield* fs.makeDirectory(cacheDir, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
    yield* fs
      .writeFileString(cachePath(cacheDir), JSON.stringify(state, null, 2))
      .pipe(Effect.catchAll(() => Effect.void));
  });

const getAlwaysConnectedNoAuthToolkits = () =>
  Effect.gen(function* () {
    const toolkitsRepository = yield* ComposioToolkitsRepository;
    const toolkits = yield* toolkitsRepository.getToolkits();

    return toolkits.filter(toolkit => toolkit.no_auth).map(toolkit => toolkit.slug.toLowerCase());
  });

const normalizeCachedToolkits = (
  toolkits: ReadonlyArray<string>,
  noAuthToolkits: ReadonlyArray<string>
) => [...new Set([...toolkits, ...noAuthToolkits].map(toolkit => toolkit.toLowerCase()))];

const normalizeAuthConfigMappings = (
  mappings?: ConsumerToolRouterAuthConfigMappings
): ConsumerToolRouterAuthConfigMappings | undefined => {
  if (!mappings) return undefined;

  const authConfigs = Object.fromEntries(
    Object.entries(mappings.authConfigs ?? {})
      .map(([toolkit, authConfigId]) => [toolkit.toLowerCase(), authConfigId])
      .filter(([, authConfigId]) => typeof authConfigId === 'string' && authConfigId.length > 0)
  );
  if (Object.keys(authConfigs).length === 0) {
    return undefined;
  }

  return {
    authConfigs,
  };
};

const mergeAuthConfigMappings = (params: {
  readonly current?: ConsumerToolRouterAuthConfigMappings;
  readonly next?: ConsumerToolRouterAuthConfigMappings;
}) => {
  const current = normalizeAuthConfigMappings(params.current);
  const next = normalizeAuthConfigMappings(params.next);
  if (!current) return next;
  if (!next) return current;

  return normalizeAuthConfigMappings({
    authConfigs: {
      ...(current.authConfigs ?? {}),
      ...(next.authConfigs ?? {}),
    },
  });
};

export const getFreshConsumerConnectedToolkitsFromCache = (params: {
  orgId: string;
  consumerUserId: string;
}) =>
  Effect.gen(function* () {
    const disabled = yield* APP_CONFIG.DISABLE_CONNECTED_ACCOUNT_CACHE;
    if (disabled) {
      return Option.none<ReadonlyArray<string>>();
    }
    const state = yield* readCache();
    const entry = state[cacheKey(params.orgId, params.consumerUserId)];
    if (!entry) {
      return Option.none<ReadonlyArray<string>>();
    }
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return Option.none<ReadonlyArray<string>>();
    }
    return Option.some(entry.toolkits);
  });

export const getFreshConsumerToolRouterAuthConfigsFromCache = (params: {
  orgId: string;
  consumerUserId: string;
  toolkits?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const disabled = yield* APP_CONFIG.DISABLE_CONNECTED_ACCOUNT_CACHE;
    if (disabled) {
      return Option.none<ConsumerToolRouterAuthConfigMappings>();
    }
    const state = yield* readCache();
    const entry = state[cacheKey(params.orgId, params.consumerUserId)];
    if (!entry) {
      return Option.none<ConsumerToolRouterAuthConfigMappings>();
    }
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return Option.none<ConsumerToolRouterAuthConfigMappings>();
    }

    const mappings = normalizeAuthConfigMappings(entry.toolRouterAuthConfigs);
    if (!mappings) {
      return Option.none<ConsumerToolRouterAuthConfigMappings>();
    }

    if (!params.toolkits || params.toolkits.length === 0) {
      return Option.some(mappings);
    }

    const requestedToolkits = params.toolkits.map(toolkit => toolkit.toLowerCase());
    const requestedAuthConfigs = requestedToolkits.map(
      toolkit => [toolkit, mappings.authConfigs?.[toolkit]] as const
    );

    if (requestedAuthConfigs.some(([, authConfigId]) => typeof authConfigId !== 'string')) {
      return Option.none<ConsumerToolRouterAuthConfigMappings>();
    }

    const filtered = normalizeAuthConfigMappings({
      authConfigs: Object.fromEntries(
        requestedAuthConfigs.map(([toolkit, authConfigId]) => [toolkit, authConfigId as string])
      ),
    });

    return filtered ? Option.some(filtered) : Option.none<ConsumerToolRouterAuthConfigMappings>();
  });

export const invalidateConsumerConnectedToolkitsCache = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    const filePath = cachePath(cacheDir);
    if (yield* fs.exists(filePath)) {
      yield* fs.remove(filePath);
    }
  });

const resolveConsumerScope = (params?: {
  readonly orgId?: string;
  readonly consumerUserId?: string;
}) =>
  Effect.gen(function* () {
    if (params?.orgId && params.consumerUserId) {
      return {
        orgId: params.orgId,
        consumerUserId: params.consumerUserId,
      };
    }

    const project = yield* resolveCommandProject({ mode: 'consumer' }).pipe(Effect.option);
    if (Option.isSome(project) && project.value.projectType === 'CONSUMER') {
      return {
        orgId: project.value.orgId,
        consumerUserId: project.value.consumerUserId ?? '',
      };
    }

    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    const orgId = Option.getOrUndefined(userContext.data.orgId);
    if (!apiKey || !orgId) {
      return null;
    }
    const consumerProject = yield* resolveConsumerProject({
      baseURL: userContext.data.baseURL,
      apiKey,
      orgId,
    }).pipe(Effect.option);
    if (Option.isNone(consumerProject)) {
      return null;
    }
    return {
      orgId,
      consumerUserId: consumerProject.value.consumer_user_id,
    };
  });

export const refreshConsumerConnectedToolkitsCache = (params?: {
  readonly orgId?: string;
  readonly consumerUserId?: string;
}) =>
  Effect.gen(function* () {
    const disabled = yield* APP_CONFIG.DISABLE_CONNECTED_ACCOUNT_CACHE;
    if (disabled) return;
    const scope = yield* resolveConsumerScope(params);
    if (!scope?.consumerUserId) {
      return;
    }

    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    if (!apiKey) {
      return;
    }

    const clientSingleton = yield* ComposioClientSingleton;
    const directToolkits = yield* Effect.gen(function* () {
      const consumerProject = yield* resolveConsumerProject({
        baseURL: userContext.data.baseURL,
        apiKey,
        orgId: scope.orgId,
      });
      const client = yield* clientSingleton.getFor({
        orgId: scope.orgId,
        projectId: consumerProject.project_id,
      });
      const connectionContext = yield* resolveToolRouterSessionConnections(
        client,
        scope.consumerUserId
      );
      return connectionContext;
    }).pipe(Effect.option);

    const connectedToolkits =
      Option.isSome(directToolkits) && directToolkits.value.connectedToolkits.length > 0
        ? directToolkits.value.connectedToolkits
        : (yield* getConsumerConnectedToolkits({
            baseURL: userContext.data.baseURL,
            apiKey,
            orgId: scope.orgId,
            consumerUserId: scope.consumerUserId,
          })).toolkits;

    const noAuthToolkits = yield* getAlwaysConnectedNoAuthToolkits();
    const state = yield* readCache();
    const key = cacheKey(scope.orgId, scope.consumerUserId);
    const currentEntry = state[key];
    const proc = yield* NodeProcess;
    const searchSessionFields = resolveSearchSessionMetadata({
      currentEntry,
      cwd: proc.cwd,
    });
    yield* writeCache({
      ...state,
      [key]: {
        toolkits: normalizeCachedToolkits(connectedToolkits, noAuthToolkits),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        toolRouterAuthConfigs: mergeAuthConfigMappings({
          current: currentEntry?.toolRouterAuthConfigs,
          next: Option.isSome(directToolkits)
            ? {
                authConfigs: directToolkits.value.authConfigs,
              }
            : undefined,
        }),
        ...searchSessionFields,
      },
    });
  });

export const writeConsumerConnectedToolkitsCache = (params: {
  readonly orgId: string;
  readonly consumerUserId: string;
  readonly toolkits: ReadonlyArray<string>;
  readonly toolRouterAuthConfigs?: ConsumerToolRouterAuthConfigMappings;
}) =>
  Effect.gen(function* () {
    const disabled = yield* APP_CONFIG.DISABLE_CONNECTED_ACCOUNT_CACHE;
    if (disabled) return;
    const noAuthToolkits = yield* getAlwaysConnectedNoAuthToolkits();
    const state = yield* readCache();
    const key = cacheKey(params.orgId, params.consumerUserId);
    const currentEntry = state[key];
    const proc = yield* NodeProcess;
    const searchSessionFields = resolveSearchSessionMetadata({
      currentEntry,
      cwd: proc.cwd,
    });

    yield* writeCache({
      ...state,
      [key]: {
        toolkits: normalizeCachedToolkits(params.toolkits, noAuthToolkits),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        toolRouterAuthConfigs: mergeAuthConfigMappings({
          current: currentEntry?.toolRouterAuthConfigs,
          next: params.toolRouterAuthConfigs,
        }),
        ...searchSessionFields,
      },
    });
  });

export const primeConsumerConnectedToolkitsCacheInBackground = (params?: {
  readonly orgId?: string;
  readonly consumerUserId?: string;
}) =>
  refreshConsumerConnectedToolkitsCache(params).pipe(
    Effect.catchAll(() => Effect.void),
    Effect.forkDaemon,
    Effect.asVoid
  );

export const getOrCreateProbablyMyCliSessionIdForCurrentCwd = (params?: {
  readonly orgId?: string;
  readonly consumerUserId?: string;
}) =>
  Effect.gen(function* () {
    const disabled = yield* APP_CONFIG.DISABLE_CONNECTED_ACCOUNT_CACHE;
    if (disabled) return Option.none<string>();
    const scope = yield* resolveConsumerScope(params);
    if (!scope?.consumerUserId) {
      return Option.none<string>();
    }

    const proc = yield* NodeProcess;
    const state = yield* readCache();
    const key = cacheKey(scope.orgId, scope.consumerUserId);
    const currentEntry = state[key];
    const searchSessionFields = resolveSearchSessionMetadata({
      currentEntry,
      cwd: proc.cwd,
    });
    const currentCwdHash = cwdHash(proc.cwd);
    const session = searchSessionFields.probablyMyCliSessionsByCwdHash[currentCwdHash];
    if (!session) {
      return Option.none<string>();
    }

    yield* writeCache({
      ...state,
      [key]: {
        toolkits: currentEntry?.toolkits ?? [],
        expiresAt: currentEntry?.expiresAt ?? new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        ...searchSessionFields,
      },
    });

    return Option.some(session.id);
  });
