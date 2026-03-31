import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import * as composioClients from 'src/services/composio-clients';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  getFreshConsumerToolRouterAuthConfigsFromCache,
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

describe('consumer short-term cache', () => {
  afterEach(() => {
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
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
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
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
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
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
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
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
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
});
