import { describe, expect, it, vi } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import {
  getSessionInfoByUserApiKey,
  listOrganizations,
  resolveConsumerProject,
} from 'src/services/composio-account';
import type { AuthConfigItem } from 'src/models/auth-configs';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { ConnectedAccountsTest, TestLive, ToolkitsTest } from 'test/__utils__';
import { makeSessionInfo } from 'test/__utils__/models/account';
import { makeToolkitFixture } from 'test/__utils__/models/toolkits';

describe('TestLayer', () => {
  it.effect('leaves globalThis.fetch untouched', () =>
    Effect.gen(function* () {
      const originalFetch = globalThis.fetch;

      yield* Effect.provide(Effect.void, TestLive()).pipe(Effect.scoped);

      expect(globalThis.fetch).toBe(originalFetch);
    })
  );

  it.effect('serves account endpoints from the mock client without calling fetch', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const [sessionInfo, consumerProject] = yield* Effect.all([
        getSessionInfoByUserApiKey({ userApiKey: 'uak_test', orgId: 'org_selected' }),
        resolveConsumerProject({ apiKey: 'uak_test', orgId: 'org_selected' }),
      ]).pipe(
        Effect.provide(
          TestLive({
            accountData: {
              sessionInfo: scope => makeSessionInfo({ orgId: scope.orgId }),
            },
          })
        ),
        Effect.scoped
      );

      expect(sessionInfo.project.org.id).toBe('org_selected');
      expect(consumerProject.consumer_user_id).toBe('consumer-user-org_selected');
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    })
  );

  it.effect('rejects an account endpoint without data as an unreachable backend would', () =>
    Effect.gen(function* () {
      const error = yield* listOrganizations({ apiKey: 'uak_test' }).pipe(
        Effect.provide(TestLive()),
        Effect.scoped,
        Effect.flip
      );

      expect(error).toMatchObject({ _tag: '@composio/client/APIConnectionError' });
    })
  );
});

describe('ToolkitsTest', () => {
  const toolkitsData = {
    toolkits: [makeToolkitFixture('gmail', 'Gmail'), makeToolkitFixture('slack', 'Slack')],
  };

  it.effect.each([
    { name: 'ToolkitsTest', layer: ToolkitsTest(toolkitsData) },
    { name: 'TestLive', layer: TestLive({ toolkitsData }) },
  ])('serves the same catalog answers through $name', ({ layer }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const search = yield* repo.searchToolkits({ search: 'gma' });
      const missing = yield* repo.getToolkitDetailed('nope').pipe(Effect.flip);

      expect(search.items.map(toolkit => toolkit.slug)).toEqual(['gmail']);
      expect(missing).toMatchObject({ _tag: '@composio/client/NotFoundError', status: 404 });
    }).pipe(Effect.provide(layer), Effect.scoped)
  );

  it.effect('dies on a repository method another family serves', () =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const exit = yield* repo.listAuthConfigs({}).pipe(Effect.exit);

      expect(Exit.hasDies(exit)).toBe(true);
    }).pipe(Effect.provide(ToolkitsTest()))
  );
});

describe('ConnectedAccountsTest', () => {
  const authConfig = (id: string, toolkitSlug: string): AuthConfigItem => ({
    id,
    name: id,
    no_of_connections: 0,
    status: 'ENABLED',
    type: 'default',
    uuid: `uuid-${id}`,
    toolkit: { logo: '', slug: toolkitSlug },
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_enabled_for_tool_router: true,
    created_at: '2026-01-01T00:00:00Z',
  });
  const connectedAccount: ConnectedAccountItem = {
    id: 'con_gmail',
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'default',
    toolkit: { slug: 'gmail' },
    auth_config: {
      id: 'ac_gmail',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    test_request_endpoint: '',
  };
  const input = {
    authConfigsData: { items: [authConfig('ac_gmail', 'gmail'), authConfig('ac_slack', 'slack')] },
    connectedAccountsData: { items: [connectedAccount] },
  };

  it.effect.each([
    { name: 'ConnectedAccountsTest', layer: ConnectedAccountsTest(input) },
    { name: 'TestLive', layer: TestLive(input) },
  ])('serves the same auth-config and connected-account answers through $name', ({ layer }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const authConfigs = yield* repo.listAuthConfigs({ toolkit_slug: 'slack' });
      const found = yield* repo.getConnectedAccount('con_gmail');
      const missing = yield* repo.getAuthConfig('ac_nope').pipe(Effect.flip);

      expect(authConfigs.items.map(item => item.id)).toEqual(['ac_slack']);
      expect(found.toolkit.slug).toBe('gmail');
      expect(missing).toMatchObject({ _tag: '@composio/client/NotFoundError', status: 404 });
    }).pipe(Effect.provide(layer), Effect.scoped)
  );

  it.effect('dies on a repository method another family serves', () =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const exit = yield* repo.getToolkits().pipe(Effect.exit);

      expect(Exit.hasDies(exit)).toBe(true);
    }).pipe(Effect.provide(ConnectedAccountsTest()))
  );
});
