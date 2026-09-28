import { describe, expect, it, vi } from '@effect/vitest';
import { Effect } from 'effect';
import {
  getSessionInfoByUserApiKey,
  HttpServerError,
  listOrganizations,
  resolveConsumerProject,
} from 'src/services/composio-clients';
import { TestLive } from 'test/__utils__';
import { makeSessionInfo } from 'test/__utils__/models/account';

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

      expect(error).toBeInstanceOf(HttpServerError);
      expect((error as HttpServerError).status).toBeUndefined();
    })
  );
});
