import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive } from 'test/__utils__';
import { makeSessionInfo } from 'test/__utils__/models/account';
import type { MockRequestScope } from 'test/__utils__/services/test-layer';

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

  const sessionInfoScopes: MockRequestScope[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      accountData: {
        sessionInfo: scope => {
          sessionInfoScopes.push(scope);
          return makeSessionInfo({
            orgId: 'org_selected',
            orgName: 'Selected Org',
            orgMemberId: 'member_selected',
          });
        },
      },
    })
  )(it => {
    it.effect('[Then] links analytics to the selected org membership', () =>
      Effect.gen(function* () {
        yield* cli(['orgs', 'switch', '--org-id', 'org_selected']);

        expect(sessionInfoScopes.map(scope => scope.orgId)).toEqual(['org_selected']);
        expect(analyticsMocks.linkCalls).toEqual(['member_selected']);
      })
    );
  });
});
