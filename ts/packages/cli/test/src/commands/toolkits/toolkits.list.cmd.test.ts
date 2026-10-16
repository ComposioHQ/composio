import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits } from 'src/models/toolkits';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testToolkits: Toolkits = [
  {
    name: 'Gmail',
    slug: 'gmail',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Email service to send and receive emails',
      categories: [],
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      available_versions: ['20250101', '20250909'],
      tools_count: 36,
      triggers_count: 2,
    },
  },
  {
    name: 'Slack',
    slug: 'slack',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Messaging platform for teams',
      categories: [],
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      available_versions: [],
      tools_count: 42,
      triggers_count: 5,
    },
  },
  {
    name: 'GitHub',
    slug: 'github',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Code hosting and collaboration platform',
      categories: [],
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      available_versions: ['20260101'],
      tools_count: 50,
      triggers_count: 10,
    },
  },
];

const toolkitsData = {
  toolkits: testToolkits,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

describe('CLI: composio dev toolkits list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no flags [Then] lists all toolkits with unified table',
    it => {
      it.effect('lists all toolkits with catalog and connection columns', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).toContain('gmail');
          expect(output).toContain('Slack');
          expect(output).toContain('GitHub');
          expect(output).toContain('Connected');
          expect(output).toContain('Version');
          expect(output).toContain('Listing 3 of 3 toolkits');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] no --user-id and no project test_user_id [Then] falls back to global test_user_id',
    it => {
      it.effect('shows connected column with global test user id', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Connected');
          expect(output).toContain('Using global test user id "global-default"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] explicit --user-id [Then] shows connected status column',
    it => {
      it.effect('shows connected column with explicit user id', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list', '--user-id', 'default']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Connected');
          expect(output).toContain('Listing 3 of 3 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --query "email"',
    it => {
      it.effect('shows filtered results', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list', '--query', 'email']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).not.toContain('GitHub');
          expect(output).toContain('Listing 1 of 1 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --limit 2',
    it => {
      it.effect('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list', '--limit', '2']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 2 of 3 toolkits');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      fixture: 'global-test-user-id',
    })
  )('[Given] the API rejects the session toolkits', it => {
    it.effect('[Then] the catalog is listed without connection status and without an error', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(
          ['toolRouter'],
          routeRequests(
            [
              {
                method: 'GET',
                path: '/api/v3.1/tool_router/session/trs_stub_session/toolkits',
                respond: () =>
                  Response.json(
                    {
                      error: { message: 'Not allowed', code: 1403, slug: 'Forbidden', status: 403 },
                    },
                    { status: 403 }
                  ),
              },
            ],
            () =>
              Response.json({
                session_id: 'trs_stub_session',
                config: { user_id: 'global-default' },
                mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
                tool_router_tools: [],
              })
          )
        );
        yield* cli(['dev', 'toolkits', 'list']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.slice(0, 3)).toEqual([
          'Using global test user id "global-default"',
          'To show status for a specific user, use `--user-id`.',
          'Fetching toolkits...',
        ]);
        expect(lines[3]).toContain('Listing 3 of 3 toolkits');
        expect(lines).toHaveLength(6);
        expect(JSON.parse(String(lines.at(-1)))).toEqual([
          expect.objectContaining({ slug: 'gmail', latest_version: '20250909', connected: null }),
          expect.objectContaining({ slug: 'slack', latest_version: null, connected: null }),
          expect.objectContaining({ slug: 'github', latest_version: '20260101', connected: null }),
        ]);
        expect(stub.requests.map(request => request.path)).toEqual([
          '/api/v3.1/tool_router/session',
          '/api/v3.1/tool_router/session/trs_stub_session/toolkits?limit=30',
        ]);
      })
    );
  });

  layer(TestLive())('[Given] no API key', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'toolkits', 'list']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('[Given] empty results', it => {
    it.effect('shows no toolkits found', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('No toolkits found');
      })
    );
  });
});
