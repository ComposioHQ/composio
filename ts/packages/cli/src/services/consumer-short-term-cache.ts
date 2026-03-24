import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { Effect, Option } from 'effect';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { NodeProcess } from 'src/services/node-process';
import {
  getConsumerConnectedToolkits,
  resolveConsumerProject,
} from 'src/services/composio-clients';
import { resolveCommandProject } from 'src/services/command-project';
import { ComposioUserContext } from 'src/services/user-context';

const CACHE_FILE = 'consumer-short-term-cache.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_SESSION_EXTENSION_MS = 2 * 60 * 1000;

type CacheEntry = {
  readonly toolkits: ReadonlyArray<string>;
  readonly expiresAt: string;
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
    yield* fs.makeDirectory(cacheDir, { recursive: true });
    yield* fs.writeFileString(cachePath(cacheDir), JSON.stringify(state, null, 2));
  });

export const getFreshConsumerConnectedToolkitsFromCache = (params: {
  orgId: string;
  consumerUserId: string;
}) =>
  Effect.gen(function* () {
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
    const scope = yield* resolveConsumerScope(params);
    if (!scope?.consumerUserId) {
      return;
    }

    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    if (!apiKey) {
      return;
    }

    const response = yield* getConsumerConnectedToolkits({
      baseURL: userContext.data.baseURL,
      apiKey,
      orgId: scope.orgId,
      consumerUserId: scope.consumerUserId,
    });
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
        toolkits: response.toolkits.map(toolkit => toolkit.toLowerCase()),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
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
