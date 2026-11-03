import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
});

const rejection = (status: number, message: string, slug: string) =>
  Response.json({ error: { message, code: 1000 + status, slug, status } }, { status });

const account = (id: string): ConnectedAccountItem => ({
  id,
  alias: null,
  status: 'ACTIVE',
  status_reason: null,
  is_disabled: false,
  user_id: 'consumer-user-org_test',
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
});

describe('CLI: composio link over the API client', () => {
  layer(testLayer)(it => {
    it.effect('lists active accounts beyond the first server page', () =>
      Effect.gen(function* () {
        const firstPage = Array.from({ length: 50 }, (_, index) => account(`con_${index}`));
        const stub = stubClientResources(['connectedAccounts'], request => {
          const cursor = new URL(request.path, 'https://stub.invalid').searchParams.get('cursor');
          return Response.json({
            items: cursor === 'page-2' ? [account('con_last')] : firstPage,
            next_cursor: cursor === 'page-2' ? null : 'page-2',
          });
        });

        yield* cli(['link', 'gmail', '--list']).pipe(Effect.provide(stub.layer));

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const result = JSON.parse(String(lines.at(-1)));
        expect(result.total).toBe(51);
        expect(result.items.at(-1).id).toBe('con_last');
        expect(stub.requests).toHaveLength(2);
        const query = {
          user_ids: 'consumer-user-org_test',
          toolkit_slugs: 'gmail',
          statuses: 'ACTIVE',
          limit: '50',
        };
        expect(
          stub.requests.map(request =>
            Object.fromEntries(new URL(request.path, 'https://stub.invalid').searchParams)
          )
        ).toEqual([query, { ...query, cursor: 'page-2' }]);
      })
    );
  });

  describe.each([
    {
      scope: 'toolkit',
      args: ['link', 'gmail', '--alias', 'work', '--no-wait'],
      userId: 'consumer-user-org_test',
      filter: 'toolkit_slugs',
      value: 'gmail',
    },
    {
      scope: 'auth config',
      args: [
        'dev',
        'connected-accounts',
        'link',
        '--auth-config',
        'ac_1',
        '--user-id',
        'user_1',
        '--alias',
        'work',
        '--no-wait',
      ],
      userId: 'user_1',
      filter: 'auth_config_ids',
      value: 'ac_1',
    },
  ])('alias conflicts in a $scope', ({ args, userId, filter, value }) => {
    layer(testLayer)(it => {
      it.effect('rejects an alias held by an account on a later page before creating a link', () =>
        Effect.gen(function* () {
          const pages = [
            {
              items: Array.from({ length: 50 }, (_, i) => account(`con_${i}`)),
              next_cursor: 'page-2',
            },
            { items: [{ ...account('con_hidden'), alias: 'Work' }], next_cursor: null },
          ];
          const stub = stubClientResources(['connectedAccounts', 'toolRouter', 'link'], () => {
            const page = pages.shift();
            return page === undefined
              ? rejection(403, 'Unexpected request', 'Forbidden')
              : Response.json(page);
          });

          const exit = yield* Effect.exit(cli(args).pipe(Effect.provide(stub.layer)));

          expect(exitCodeOf(exit)).toBe(1);
          expect((yield* MockConsole.getLines({ stripAnsi: true })).join('\n')).toContain(
            'Alias "work" is already in use by connected account "con_hidden".'
          );
          expect(stub.requests).toHaveLength(2);
          expect(stub.requests.every(request => request.method === 'GET')).toBe(true);
          const query = { user_ids: userId, [filter]: value, statuses: 'ACTIVE', limit: '50' };
          expect(
            stub.requests.map(request =>
              Object.fromEntries(new URL(request.path, 'https://stub.invalid').searchParams)
            )
          ).toEqual([query, { ...query, cursor: 'page-2' }]);
        })
      );
    });
  });

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
