import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { resolveToolRouterSessionConnections } from 'src/services/tool-router-session-connections';
import { stubComposioClient } from 'test/__utils__/services/stub-composio-client';

const forbidden = () =>
  Response.json(
    { error: { message: 'Not allowed', code: 1403, slug: 'Forbidden', status: 403 } },
    { status: 403 }
  );

describe('resolveToolRouterSessionConnections', () => {
  it.effect.each([
    { listing: 'the listing for the requested toolkits', toolkits: ['gmail'] },
    { listing: 'the shared listing of every active account', toolkits: undefined },
  ])('resolves no connections when the API rejects $listing', ({ toolkits }) =>
    Effect.gen(function* () {
      const { client, requests } = stubComposioClient(forbidden);

      const context = yield* resolveToolRouterSessionConnections(client, 'user_1', { toolkits });

      expect(context).toEqual({
        connectedToolkits: [],
        authConfigs: undefined,
        connectedAccounts: undefined,
        availableConnectedAccounts: undefined,
      });
      expect(requests).toHaveLength(1);
    })
  );
});
