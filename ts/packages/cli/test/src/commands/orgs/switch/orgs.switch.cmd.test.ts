import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { makeSessionInfo } from 'test/__utils__/models/account';
import type { MockAccountRequest, MockRequestScope } from 'test/__utils__/services/test-layer';

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

// The fixture stores a login with current org `org_test` and test user id `global-default`.
const FIXTURE_WITH_TEST_USER = 'global-test-user-id';

const SELECTED_SESSION_INFO = makeSessionInfo({
  orgId: 'org_selected',
  orgName: 'Selected Org',
  orgMemberId: 'member_selected',
});

/** The user config `ComposioUserContext` wrote to disk. */
const readStoredUserConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const cacheDir = yield* setupCacheDir;
  const raw = yield* fs.readFileString(path.join(cacheDir, constants.USER_CONFIG_FILE_NAME));
  return JSON.parse(raw) as Record<string, unknown>;
});

describe('CLI: composio orgs switch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    analyticsMocks.linkCalls.length = 0;
  });

  layer(TestLive())('[Given] no API key', it => {
    it.effect('[Then] fails with NotLoggedInError', () =>
      Effect.gen(function* () {
        const error = yield* cli(['orgs', 'switch', '--org-id', 'org_selected']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-with-empty-api-key' }))(
    '[Given] a stored login whose api key is empty',
    it => {
      it.effect('[Then] fails with NotLoggedInError and leaves the stored config untouched', () =>
        Effect.gen(function* () {
          const error = yield* cli(['orgs', 'switch', '--org-id', 'org_selected']).pipe(
            Effect.flip
          );

          expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
          expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([]);
          expect(yield* readStoredUserConfig).toEqual({
            api_key: '',
            org_id: 'org_1',
            project_id: 'project_1',
          });
        })
      );
    }
  );

  const testConfigProvider = ConfigProvider.fromEnvRecord({
    COMPOSIO_USER_API_KEY: 'uak_switch_test',
  });

  const sessionInfoScopes: MockRequestScope[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      accountData: {
        sessionInfo: scope => {
          sessionInfoScopes.push(scope);
          return SELECTED_SESSION_INFO;
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

  const explicitRequests: MockAccountRequest[] = [];
  layer(
    TestLive({
      fixture: FIXTURE_WITH_TEST_USER,
      accountData: {
        sessionInfo: SELECTED_SESSION_INFO,
        organizations: [{ id: 'org_other', name: 'Other Org' }],
        onRequest: request => explicitRequests.push(request),
      },
    })
  )('[Given] --org-id', it => {
    it.effect(
      '[Then] stores that org, keeps the key and test user id, and prints it on stdout',
      () =>
        Effect.gen(function* () {
          yield* cli(['orgs', 'switch', '--org-id', 'org_selected']);

          expect(explicitRequests.map(request => request.operation)).not.toContain('org.list');

          const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
          const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
          expect(stdout).toEqual([JSON.stringify({ scope: 'global', org_id: 'org_selected' })]);
          expect(stderr).toEqual([
            '-- composio orgs switch --',
            '[Current org] This updates your current org for CLI commands. Use `composio dev init` for local developer project setup.',
            'Selected organization: "org_selected" (org_selected)',
            'Updated current org to "org_selected".',
            '-- Current org updated. --',
          ]);

          expect(yield* readStoredUserConfig).toMatchObject({
            api_key: 'test_api_key',
            org_id: 'org_selected',
            test_user_id: 'global-default',
          });
        })
    );
  });

  layer(
    TestLive({
      fixture: FIXTURE_WITH_TEST_USER,
      accountData: {
        sessionInfo: SELECTED_SESSION_INFO,
        organizations: [{ id: 'org_selected', name: 'Selected Org' }],
      },
    })
  )('[Given] no --org-id and one organization', it => {
    it.effect('[Then] selects it without prompting and stores it', () =>
      Effect.gen(function* () {
        yield* cli(['orgs', 'switch']);

        const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
        const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
        expect(stdout).toEqual([JSON.stringify({ scope: 'global', org_id: 'org_selected' })]);
        expect(stderr).toContain('Loaded 1 orgs');
        expect(stderr).toContain('Updated current org to "Selected Org".');
        expect((yield* readStoredUserConfig).org_id).toBe('org_selected');
      })
    );
  });

  layer(TestLive({ fixture: FIXTURE_WITH_TEST_USER, accountData: { organizations: [] } }))(
    '[Given] no --org-id and no organizations',
    it => {
      it.effect('[Then] warns, prints no data, and keeps the stored org', () =>
        Effect.gen(function* () {
          yield* cli(['orgs', 'switch']);

          const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
          const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
          expect(stdout).toEqual([]);
          expect(stderr).toEqual([
            '-- composio orgs switch --',
            '[Current org] This updates your current org for CLI commands. Use `composio dev init` for local developer project setup.',
            'Loaded 0 orgs',
            'No organizations found for this API key.',
            '-- No org selected. --',
          ]);
          expect((yield* readStoredUserConfig).org_id).toBe('org_test');
          expect(analyticsMocks.linkCalls).toEqual([]);
        })
      );
    }
  );

  layer(
    TestLive({
      fixture: 'user-config-staging-login',
      baseConfigProvider: ConfigProvider.fromEnvRecord({
        COMPOSIO_BASE_URL: 'https://backend.composio.dev',
      }),
      accountData: {
        sessionInfo: () =>
          makeSessionInfo({ orgId: 'org_2', orgName: 'Org 2', orgMemberId: 'member_2' }),
      },
    })
  )('[Given] a staging login and COMPOSIO_BASE_URL pointing elsewhere', it => {
    it.effect('[Then] it switches the org and keeps the backend the login was issued by', () =>
      Effect.gen(function* () {
        yield* cli(['orgs', 'switch', '--org-id', 'org_2']);

        expect(yield* readStoredUserConfig).toMatchObject({
          api_key: 'uak_staging_login',
          org_id: 'org_2',
          base_url: 'https://staging-backend.composio.dev',
          web_url: 'https://staging-dashboard.composio.dev/',
        });
      })
    );
  });
});
