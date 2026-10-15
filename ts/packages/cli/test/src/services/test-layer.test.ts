import { describe, expect, it, vi } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import {
  getSessionInfoByUserApiKey,
  listOrganizations,
  resolveConsumerProject,
} from 'src/services/composio-account';
import { TestLive, ToolkitsTest } from 'test/__utils__';
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
