import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { afterEach, vi } from 'vitest';
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

  const testConfigProvider = ConfigProvider.fromMap(
    new Map([['COMPOSIO_USER_API_KEY', 'uak_switch_test']])
  ).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.scoped('[Then] links analytics to the selected org membership', () =>
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
});
