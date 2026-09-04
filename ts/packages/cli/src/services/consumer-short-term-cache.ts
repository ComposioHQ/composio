import { FileSystem, Path } from '@effect/platform';
import { Effect, Option, Record as EffectRecord, Schema } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';
import { JsonRecordSchema } from 'src/effects/json';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { NodeProcess } from 'src/services/node-process';
import {
  ComposioToolkitsRepository,
  ComposioClientSingleton,
  getConsumerConnectedToolkits,
  resolveConsumerProject,
} from 'src/services/composio-clients';
import { resolveCommandProject } from 'src/services/command-project';
import { collectDecodedEntries } from 'src/utils/collect-decoded-entries';
import { djb2Hash } from 'src/utils/djb2';
import { resolveToolRouterSessionConnections } from 'src/services/tool-router-session-connections';
import { ComposioUserContext } from 'src/services/user-context';
import {
  CachedConnectedAccountSummarySchema,
  type CachedConnectedAccountSummary,
} from 'src/services/connected-account-selection';

const CACHE_FILE = 'consumer-short-term-cache.json';
const CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_SESSION_EXTENSION_MS = 5 * 60 * 1000;

const StringMappingsSchema = Schema.Record({ key: Schema.String, value: Schema.String });
const AvailableConnectedAccountsSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Array(CachedConnectedAccountSummarySchema),
});
const ConsumerToolRouterAuthConfigMappingsSchema = Schema.Struct({
  authConfigs: Schema.optional(StringMappingsSchema),
});
const ConsumerToolRouterConnectedAccountMappingsSchema = Schema.Struct({
  connectedAccounts: Schema.optional(StringMappingsSchema),
  availableConnectedAccounts: Schema.optional(AvailableConnectedAccountsSchema),
});
const CacheEntrySchema = Schema.Struct({
  toolkits: Schema.Array(Schema.String),
  expiresAt: Schema.String,
  toolRouterAuthConfigs: Schema.optional(ConsumerToolRouterAuthConfigMappingsSchema),
  toolRouterConnectedAccounts: Schema.optional(ConsumerToolRouterConnectedAccountMappingsSchema),
  probablyMyCliSessionsByCwdHash: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Struct({ id: Schema.String, expiresAt: Schema.String }),
    })
  ),
});

export type ConsumerToolRouterAuthConfigMappings =
  typeof ConsumerToolRouterAuthConfigMappingsSchema.Type;
export type ConsumerToolRouterConnectedAccountMappings =
  typeof ConsumerToolRouterConnectedAccountMappingsSchema.Type;
type CacheEntry = typeof CacheEntrySchema.Type;
type CacheState = { readonly [key: string]: CacheEntry };
const decodeCacheShell = Schema.decodeUnknownOption(Schema.parseJson(JsonRecordSchema));
const decodeCacheEntry = Schema.decodeUnknownOption(CacheEntrySchema);

// Per-entry decode: one stale or version-skewed entry (e.g. written by a
// newer CLI) drops only itself; discarding the whole cache would also be
// persisted back on the next write, permanently destroying the good entries.
export const decodeCacheStateTolerant = (raw: string): CacheState =>
  Option.match(decodeCacheShell(raw), {
    onNone: (): CacheState => ({}),
    onSome: shell => collectDecodedEntries(shell, decodeCacheEntry),
  });

const cacheKey = (orgId: string, consumerUserId: string) => `${orgId}:${consumerUserId}`;

const cachePath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const cacheDir = yield* setupCacheDir;
  return path.join(cacheDir, CACHE_FILE);
});

const cwdHash = (cwd: string): string => djb2Hash(cwd).toString(36);

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

  const probablyMyCliSessionsByCwdHash = EffectRecord.fromEntries(
    EffectRecord.toEntries(previousMap).filter(([, session]) => {
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
    const filePath = yield* cachePath;
    if (!(yield* fs.exists(filePath))) {
      return {} satisfies CacheState;
    }
    const raw = yield* fs.readFileString(filePath, 'utf8');
    return decodeCacheStateTolerant(raw);
  });

const writeCache = (state: CacheState) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    const filePath = yield* cachePath;
    yield* fs.makeDirectory(cacheDir, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
    yield* fs
      .writeFileString(filePath, JSON.stringify(state, null, 2))
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
  if (EffectRecord.isEmptyRecord(authConfigs)) {
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

const normalizeConnectedAccountMappings = (
  mappings?: ConsumerToolRouterConnectedAccountMappings
): ConsumerToolRouterConnectedAccountMappings | undefined => {
  if (!mappings) return undefined;

  const connectedAccounts = Object.fromEntries(
    Object.entries(mappings.connectedAccounts ?? {})
      .map(([toolkit, connectedAccountId]) => [toolkit.toLowerCase(), connectedAccountId])
      .filter(
        ([, connectedAccountId]) =>
          typeof connectedAccountId === 'string' && connectedAccountId.length > 0
      )
  );

  const availableConnectedAccounts = Object.fromEntries(
    Object.entries(mappings.availableConnectedAccounts ?? {})
      .map(([toolkit, accounts]) => [
        toolkit.toLowerCase(),
        accounts.filter(
          account =>
            typeof account.id === 'string' &&
            account.id.length > 0 &&
            typeof account.updatedAt === 'string' &&
            typeof account.createdAt === 'string'
        ),
      ])
      .filter(([, accounts]) => accounts.length > 0)
  );

  if (
    EffectRecord.isEmptyRecord(connectedAccounts) &&
    EffectRecord.isEmptyRecord(availableConnectedAccounts)
  ) {
    return undefined;
  }

  return {
    connectedAccounts: EffectRecord.isEmptyRecord(connectedAccounts)
      ? undefined
      : connectedAccounts,
    availableConnectedAccounts: EffectRecord.isEmptyRecord(availableConnectedAccounts)
      ? undefined
      : availableConnectedAccounts,
  };
};

const mergeConnectedAccountMappings = (params: {
  readonly current?: ConsumerToolRouterConnectedAccountMappings;
  readonly next?: ConsumerToolRouterConnectedAccountMappings;
}) => {
  const current = normalizeConnectedAccountMappings(params.current);
  const next = normalizeConnectedAccountMappings(params.next);
  if (!current) return next;
  if (!next) return current;

  return normalizeConnectedAccountMappings({
    connectedAccounts: {
      ...(current.connectedAccounts ?? {}),
      ...(next.connectedAccounts ?? {}),
    },
    availableConnectedAccounts: {
      ...(current.availableConnectedAccounts ?? {}),
      ...(next.availableConnectedAccounts ?? {}),
    },
  });
};

// Shared prefix of every getFresh*FromCache accessor: bail to Option.none()
// when the cache is disabled, the entry is missing, or its TTL has passed.
const getFreshCacheEntry = (params: { orgId: string; consumerUserId: string }) =>
  Effect.gen(function* () {
    const disabled = yield* APP_CONFIG.DISABLE_CONNECTED_ACCOUNT_CACHE;
    if (disabled) {
      return Option.none<CacheEntry>();
    }
    const state = yield* readCache();
    const entry = state[cacheKey(params.orgId, params.consumerUserId)];
    if (!entry) {
      return Option.none<CacheEntry>();
    }
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return Option.none<CacheEntry>();
    }
    return Option.some(entry);
  });

export const getFreshConsumerConnectedToolkitsFromCache = (params: {
  orgId: string;
  consumerUserId: string;
}) => getFreshCacheEntry(params).pipe(Effect.map(Option.map(entry => entry.toolkits)));

export const getFreshConsumerToolRouterAuthConfigsFromCache = (params: {
  orgId: string;
  consumerUserId: string;
  toolkits?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const entry = yield* getFreshCacheEntry(params);
    if (Option.isNone(entry)) {
      return Option.none<ConsumerToolRouterAuthConfigMappings>();
    }

    const mappings = normalizeAuthConfigMappings(entry.value.toolRouterAuthConfigs);
    if (!mappings) {
      return Option.none<ConsumerToolRouterAuthConfigMappings>();
    }

    if (!params.toolkits || params.toolkits.length === 0) {
      return Option.some(mappings);
    }

    const requestedToolkits = params.toolkits.map(toolkit => toolkit.toLowerCase());
    const requestedAuthConfigs: Record<string, string> = {};
    for (const toolkit of requestedToolkits) {
      const authConfigId = mappings.authConfigs?.[toolkit];
      if (typeof authConfigId !== 'string') {
        return Option.none<ConsumerToolRouterAuthConfigMappings>();
      }
      requestedAuthConfigs[toolkit] = authConfigId;
    }

    const filtered = normalizeAuthConfigMappings({ authConfigs: requestedAuthConfigs });

    return filtered ? Option.some(filtered) : Option.none<ConsumerToolRouterAuthConfigMappings>();
  });

export const getFreshConsumerToolRouterConnectedAccountsFromCache = (params: {
  orgId: string;
  consumerUserId: string;
  toolkits?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const entry = yield* getFreshCacheEntry(params);
    if (Option.isNone(entry)) {
      return Option.none<ConsumerToolRouterConnectedAccountMappings>();
    }

    const mappings = normalizeConnectedAccountMappings(entry.value.toolRouterConnectedAccounts);
    if (!mappings) {
      return Option.none<ConsumerToolRouterConnectedAccountMappings>();
    }

    if (!params.toolkits || params.toolkits.length === 0) {
      return Option.some(mappings);
    }

    const requestedToolkits = params.toolkits.map(toolkit => toolkit.toLowerCase());
    const filteredConnectedAccounts = EffectRecord.fromEntries(
      requestedToolkits.flatMap(toolkit => {
        const connectedAccountId = mappings.connectedAccounts?.[toolkit];
        return typeof connectedAccountId === 'string'
          ? [[toolkit, connectedAccountId] as const]
          : [];
      })
    );
    const filteredAvailableConnectedAccounts: Record<
      string,
      ReadonlyArray<CachedConnectedAccountSummary>
    > = EffectRecord.fromEntries(
      requestedToolkits.flatMap(toolkit => {
        const accounts = mappings.availableConnectedAccounts?.[toolkit];
        return Array.isArray(accounts) && accounts.length > 0 ? [[toolkit, accounts] as const] : [];
      })
    );
    const filtered = normalizeConnectedAccountMappings({
      connectedAccounts: filteredConnectedAccounts,
      availableConnectedAccounts: filteredAvailableConnectedAccounts,
    });

    return filtered
      ? Option.some(filtered)
      : Option.none<ConsumerToolRouterConnectedAccountMappings>();
  });

export const invalidateConsumerConnectedToolkitsCache = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const filePath = yield* cachePath;
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
        toolRouterConnectedAccounts: mergeConnectedAccountMappings({
          current: currentEntry?.toolRouterConnectedAccounts,
          next: Option.isSome(directToolkits)
            ? {
                connectedAccounts: directToolkits.value.connectedAccounts,
                availableConnectedAccounts: directToolkits.value.availableConnectedAccounts,
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
  readonly toolRouterConnectedAccounts?: ConsumerToolRouterConnectedAccountMappings;
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
        toolkits: normalizeCachedToolkits(
          [...(currentEntry?.toolkits ?? []), ...params.toolkits],
          noAuthToolkits
        ),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        toolRouterAuthConfigs: mergeAuthConfigMappings({
          current: currentEntry?.toolRouterAuthConfigs,
          next: params.toolRouterAuthConfigs,
        }),
        toolRouterConnectedAccounts: mergeConnectedAccountMappings({
          current: currentEntry?.toolRouterConnectedAccounts,
          next: params.toolRouterConnectedAccounts,
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
        toolRouterAuthConfigs: currentEntry?.toolRouterAuthConfigs,
        toolRouterConnectedAccounts: currentEntry?.toolRouterConnectedAccounts,
        ...searchSessionFields,
      },
    });

    return Option.some(session.id);
  });
