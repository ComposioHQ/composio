import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

const rejection = (status: number, message: string, slug: string) =>
  Response.json({ error: { message, code: 1000 + status, slug, status } }, { status });

describe('CLI: composio link over the API client', () => {
  layer(testLayer)('[Given] the API rejects the link for a toolkit', it => {
    it.effect('[Then] the API message and the browse hint are printed', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(
          ['toolRouter'],
          routeRequests(
            [
              {
                method: 'POST',
                path: '/api/v3.1/tool_router/session/trs_stub_session/link',
                respond: () =>
                  rejection(
                    400,
                    'Toolkit gmail is disabled for this project',
                    'ToolRouterV2_ToolkitDisabled'
                  ),
              },
            ],
            () =>
              Response.json({
                session_id: 'trs_stub_session',
                config: { user_id: 'consumer-user-org_test' },
                mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
                tool_router_tools: [],
              })
          )
        );
        const exit = yield* Effect.exit(
          cli(['link', 'gmail', '--no-wait']).pipe(Effect.provide(stub.layer))
        );
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(exitCodeOf(exit)).toBe(1);

        expect(lines).toEqual([
          'Toolkit gmail is disabled for this project',
          'Browse available toolkits:\n> composio dev toolkits list',
        ]);
        expect(stub.requests.at(-1)).toEqual({
          method: 'POST',
          path: '/api/v3.1/tool_router/session/trs_stub_session/link',
          body: { toolkit: 'gmail' },
        });
      })
    );
  });

  layer(testLayer)('[Given] the API rejects the link for an auth config', it => {
    it.effect('[Then] the API message and the browse hint are printed', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['link'], () =>
          rejection(404, 'Auth config ac_missing not found', 'AuthConfig_NotFound')
        );
        const exit = yield* Effect.exit(
          cli([
            'dev',
            'connected-accounts',
            'link',
            '--auth-config',
            'ac_missing',
            '--user-id',
            'user_1',
            '--no-wait',
          ]).pipe(Effect.provide(stub.layer))
        );
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(exitCodeOf(exit)).toBe(1);

        expect(lines).toEqual([
          'Auth config ac_missing not found',
          'Browse available auth configs:\n> composio dev auth-configs list',
        ]);
        expect(stub.requests).toEqual([
          {
            method: 'POST',
            path: '/api/v3.1/connected_accounts/link',
            body: { auth_config_id: 'ac_missing', user_id: 'user_1' },
          },
        ]);
      })
    );
  });
});
