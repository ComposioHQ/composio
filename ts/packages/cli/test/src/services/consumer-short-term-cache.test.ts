import { describe, expect, layer } from '@effect/vitest';
import { vi, beforeEach, afterEach } from 'vitest';
import { FileSystem } from '@effect/platform';
import { ConfigProvider, DateTime, Effect, Option } from 'effect';
import path from 'node:path';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { extendConfigProvider } from 'src/services/config';
import * as composioClients from 'src/services/composio-clients';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  getFreshConsumerToolRouterAuthConfigsFromCache,
  getFreshConsumerToolRouterConnectedAccountsFromCache,
  refreshConsumerConnectedToolkitsCache,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { TestLive } from 'test/__utils__';

const makeTestConfigProvider = (entries: Array<[string, string]>) =>
  ConfigProvider.fromMap(
    new Map([
      ['COMPOSIO_USER_API_KEY', 'test_api_key'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
      ...entries,
    ])
  ).pipe(extendConfigProvider);

const defaultTestConfigProvider = makeTestConfigProvider([]);
const cacheEnabledTestConfigProvider = makeTestConfigProvider([
  ['COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE', 'false'],
]);

// Instant the wall clock is pinned to; fixture expiresAt values below are
// written relative to it so freshness checks in the SUT stay deterministic.
const PINNED_NOW = '2026-01-01T00:00:00.000Z';
const ONE_MINUTE_FROM_PINNED_NOW = '2026-01-01T00:01:00.000Z';

describe('consumer short-term cache', () => {
  beforeEach(() => {
    // Fake ONLY Date so real timers and promise scheduling keep working.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(PINNED_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  layer(TestLive({ baseConfigProvider: defaultTestConfigProvider }))(
    '[Given] the default cache config [Then] connected-account cache stays disabled',
    it => {
      it.scoped('returns none even after a write is attempted', () =>
        Effect.gen(function* () {
          yield* writeConsumerConnectedToolkitsCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
            toolkits: ['github'],
          });

          const cached = yield* getFreshConsumerConnectedToolkitsFromCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
          });

          expect(cached).toEqual(Option.none());
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: cacheEnabledTestConfigProvider,
      toolkitsData: {
        toolkits: [
          {
            name: 'GitHub',
            slug: 'github',
            auth_schemes: ['OAUTH2'],
            composio_managed_auth_schemes: ['OAUTH2'],
            is_local_toolkit: false,
            no_auth: false,
            meta: {
              description: 'GitHub toolkit',
              categories: [],
              created_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              updated_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              available_versions: [],
              tools_count: 0,
              triggers_count: 0,
            },
          },
          {
            name: 'Hacker News',
            slug: 'hackernews',
            auth_schemes: [],
            composio_managed_auth_schemes: [],
            is_local_toolkit: false,
            no_auth: true,
            meta: {
              description: 'No-auth toolkit',
              categories: [],
              created_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              updated_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              available_versions: [],
              tools_count: 0,
              triggers_count: 0,
            },
          },
        ],
      },
    })
  )('[Given] no-auth toolkits [Then] refresh caches them as connected', it => {
    it.scoped('stores connected and no-auth toolkit slugs together', () =>
      Effect.gen(function* () {
        vi.spyOn(composioClients, 'getConsumerConnectedToolkits').mockReturnValue(
          Effect.succeed({ toolkits: ['github'] })
        );

        yield* refreshConsumerConnectedToolkitsCache({
          orgId: 'org_test',
          consumerUserId: 'consumer-user-test',
        });

        const cached = yield* getFreshConsumerConnectedToolkitsFromCache({
          orgId: 'org_test',
          consumerUserId: 'consumer-user-test',
        });

        expect(cached).toEqual(Option.some(['github', 'hackernews']));
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: cacheEnabledTestConfigProvider,
      toolkitsData: {
        toolkits: [
          {
            name: 'GitHub',
            slug: 'github',
            auth_schemes: ['OAUTH2'],
            composio_managed_auth_schemes: ['OAUTH2'],
            is_local_toolkit: false,
            no_auth: false,
            meta: {
              description: 'GitHub toolkit',
              categories: [],
              created_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              updated_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              available_versions: [],
              tools_count: 0,
              triggers_count: 0,
            },
          },
          {
            name: 'Hacker News',
            slug: 'hackernews',
            auth_schemes: [],
            composio_managed_auth_schemes: [],
            is_local_toolkit: false,
            no_auth: true,
            meta: {
              description: 'No-auth toolkit',
              categories: [],
              created_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              updated_at: DateTime.unsafeMake('2024-05-03T11:44:32.061Z'),
              available_versions: [],
              tools_count: 0,
              triggers_count: 0,
            },
          },
        ],
      },
    })
  )('[Given] a search cache write [Then] no-auth toolkits are preserved', it => {
    it.scoped('stores active and no-auth toolkit slugs together', () =>
      Effect.gen(function* () {
        yield* writeConsumerConnectedToolkitsCache({
          orgId: 'org_test',
          consumerUserId: 'consumer-user-test',
          toolkits: ['github'],
        });

        const cached = yield* getFreshConsumerConnectedToolkitsFromCache({
          orgId: 'org_test',
          consumerUserId: 'consumer-user-test',
        });

        expect(cached).toEqual(Option.some(['github', 'hackernews']));
      })
    );
  });

  layer(TestLive({ baseConfigProvider: cacheEnabledTestConfigProvider }))(
    '[Given] a malformed persisted cache [Then] cache reads fail closed',
    it => {
      it.scoped('ignores cache entries that do not match the persisted schema', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          yield* fs.writeFileString(
            path.join(cacheDir, 'consumer-short-term-cache.json'),
            JSON.stringify({
              'org_test:consumer-user-test': {
                toolkits: 'github',
                expiresAt: ONE_MINUTE_FROM_PINNED_NOW,
              },
            })
          );

          const cached = yield* getFreshConsumerConnectedToolkitsFromCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
          });

          expect(cached).toEqual(Option.none());
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: cacheEnabledTestConfigProvider }))(
    '[Given] one corrupt entry among valid ones [Then] only the corrupt entry is dropped',
    it => {
      it.scoped('keeps valid cache entries when a sibling entry is corrupt', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          yield* fs.writeFileString(
            path.join(cacheDir, 'consumer-short-term-cache.json'),
            JSON.stringify({
              'org_bad:consumer-user-bad': { toolkits: 'not-an-array', expiresAt: 42 },
              'org_test:consumer-user-test': {
                toolkits: ['github'],
                expiresAt: ONE_MINUTE_FROM_PINNED_NOW,
              },
            })
          );

          const cached = yield* getFreshConsumerConnectedToolkitsFromCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
          });

          const toolkits = Option.getOrElse(cached, (): ReadonlyArray<string> => []);
          expect(toolkits).toContain('github');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: cacheEnabledTestConfigProvider }))(
    '[Given] a full auth-config cache hit [Then] cache reads are toolkit-complete',
    it => {
      it.scoped('returns cached auth configs when every requested toolkit is covered', () =>
        Effect.gen(function* () {
          yield* writeConsumerConnectedToolkitsCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
            toolkits: ['posthog', 'hubspot'],
            toolRouterAuthConfigs: {
              authConfigs: {
                posthog: 'ac_posthog',
                hubspot: 'ac_hubspot',
              },
            },
          });

          const cached = yield* getFreshConsumerToolRouterAuthConfigsFromCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
            toolkits: ['posthog', 'hubspot'],
          });

          expect(cached).toEqual(
            Option.some({
              authConfigs: {
                posthog: 'ac_posthog',
                hubspot: 'ac_hubspot',
              },
            })
          );
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: cacheEnabledTestConfigProvider }))(
    '[Given] a partial auth-config cache hit [Then] cache read fails closed',
    it => {
      it.scoped('returns none unless every requested toolkit has a cached auth config', () =>
        Effect.gen(function* () {
          yield* writeConsumerConnectedToolkitsCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
            toolkits: ['posthog', 'hubspot'],
            toolRouterAuthConfigs: {
              authConfigs: {
                posthog: 'ac_posthog',
              },
            },
          });

          const cached = yield* getFreshConsumerToolRouterAuthConfigsFromCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
            toolkits: ['posthog', 'hubspot'],
          });

          expect(cached).toEqual(Option.none());
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: cacheEnabledTestConfigProvider }))(
    '[Given] cached connected account metadata [Then] default mappings and summaries are readable',
    it => {
      it.scoped('returns cached connected account selectors by toolkit', () =>
        Effect.gen(function* () {
          yield* writeConsumerConnectedToolkitsCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
            toolkits: ['gmail'],
            toolRouterConnectedAccounts: {
              connectedAccounts: {
                gmail: 'con_default',
              },
              availableConnectedAccounts: {
                gmail: [
                  {
                    id: 'con_default',
                    alias: 'default',
                    wordId: 'castle',
                    updatedAt: '2026-01-02T00:00:00.000Z',
                    createdAt: '2026-01-01T00:00:00.000Z',
                  },
                ],
              },
            },
          });

          const cached = yield* getFreshConsumerToolRouterConnectedAccountsFromCache({
            orgId: 'org_test',
            consumerUserId: 'consumer-user-test',
            toolkits: ['gmail'],
          });

          expect(cached).toEqual(
            Option.some({
              connectedAccounts: {
                gmail: 'con_default',
              },
              availableConnectedAccounts: {
                gmail: [
                  {
                    id: 'con_default',
                    alias: 'default',
                    wordId: 'castle',
                    updatedAt: '2026-01-02T00:00:00.000Z',
                    createdAt: '2026-01-01T00:00:00.000Z',
                  },
                ],
              },
            })
          );
        })
      );
    }
  );
});
