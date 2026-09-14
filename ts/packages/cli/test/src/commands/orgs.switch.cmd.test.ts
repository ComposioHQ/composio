import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { STAGING_BASE_URL, STAGING_WEB_URL, USER_CONFIG_FILE_NAME } from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive } from 'test/__utils__';

const analyticsMocks = vi.hoisted(() => ({
  linkCalls: [] as string[],
}));

vi.mock('src/analytics/dispatch', async importOriginal => {
  const actual = await importOriginal<typeof import('src/analytics/dispatch')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    analyticsIdentityLinkingEnabled: Effect.succeed(true),
    linkApolloIdentityForAnalytics: ((apolloUserId: string) =>
      Effect.sync(() => {
        analyticsMocks.linkCalls.push(apolloUserId);
      })) as unknown as typeof actual.linkApolloIdentityForAnalytics,
  };
});

describe('CLI: composio orgs switch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    analyticsMocks.linkCalls.length = 0;
  });

  const testConfigProvider = ConfigProvider.fromEnvRecord({
    COMPOSIO_USER_API_KEY: 'uak_switch_test',
  }).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.effect('[Then] links analytics to the selected org membership', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
          async (_requestInput: RequestInfo | URL, init?: RequestInit) => {
            expect(new Headers(init?.headers).get('x-org-id')).toBe('org_selected');
            return new Response(
              JSON.stringify({
                project: {
                  name: 'Selected Project',
                  id: 'project_selected',
                  org_id: 'org_selected',
                  nano_id: 'project_selected',
                  email: 'project@example.com',
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  org: { id: 'org_selected', name: 'Selected Org', plan: 'enterprise' },
                },
                org_member: {
                  id: 'member_selected',
                  user_id: 'user_123',
                  email: 'cli@example.com',
                  name: 'CLI User',
                  role: 'admin',
                },
                api_key: null,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        );

        yield* cli(['orgs', 'switch', '--org-id', 'org_selected']);

        expect(analyticsMocks.linkCalls).toEqual(['member_selected']);
      })
    );
  });

  layer(
    TestLive({
      userData: {
        api_key: 'uak_staging',
        base_url: STAGING_BASE_URL,
        web_url: STAGING_WEB_URL,
        org_id: 'org_old',
      },
    })
  )(it => {
    it.effect('[Given] a stored staging login and no env vars [Then] keeps staging stored', () =>
      Effect.gen(function* () {
        const requestedOrigins: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
          const url = requestInput instanceof Request ? requestInput.url : String(requestInput);
          requestedOrigins.push(new URL(url).origin);
          return new Response(JSON.stringify(sessionInfoFor('org_selected')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });

        yield* cli(['orgs', 'switch', '--org-id', 'org_selected']);

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const userConfig = JSON.parse(
          yield* fs.readFileString(path.join(cacheDir, USER_CONFIG_FILE_NAME), 'utf8')
        ) as Record<string, unknown>;
        expect(userConfig.org_id).toBe('org_selected');
        expect(userConfig.base_url).toBe(STAGING_BASE_URL);
        expect(userConfig.web_url).toBe(STAGING_WEB_URL);
        expect(requestedOrigins.length).toBeGreaterThan(0);
        expect(new Set(requestedOrigins)).toEqual(new Set([STAGING_BASE_URL]));
      })
    );
  });
});

const sessionInfoFor = (orgId: string) => ({
  project: {
    name: 'Selected Project',
    id: 'project_selected',
    org_id: orgId,
    nano_id: 'project_selected',
    email: 'project@example.com',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    org: { id: orgId, name: 'Selected Org', plan: 'enterprise' },
  },
  org_member: {
    id: 'member_selected',
    user_id: 'user_123',
    email: 'cli@example.com',
    name: 'CLI User',
    role: 'admin',
  },
  api_key: null,
});
