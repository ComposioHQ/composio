import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import * as composioClients from 'src/services/composio-clients';
import {
  getFreshConsumerConnectedToolkitsFromCache,
  refreshConsumerConnectedToolkitsCache,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([
    ['COMPOSIO_USER_API_KEY', 'test_api_key'],
    ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
  ])
).pipe(extendConfigProvider);

describe('consumer short-term cache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
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
      baseConfigProvider: testConfigProvider,
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
});
