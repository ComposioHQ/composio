import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect } from 'effect';
import type { ToolkitDetailed } from 'src/models/toolkits';
import { cli, cliExit, MockConsole, TestLive } from 'test/__utils__';
import {
  DEFAULT_PROJECT_SCOPE,
  defaultDeveloperProjectAccountData,
  DIRECTORY_PROJECT_SCOPE,
  inDeveloperProjectDirectory,
  loginWithoutDeveloperProject,
  NO_DIRECTORY_PROJECT_NOTICE,
  OTHER_DEVELOPER_PROJECT,
  OTHER_PROJECT_SCOPE,
} from 'test/__utils__/layers/developer-project';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';

const gmail: ToolkitDetailed = {
  name: 'Gmail',
  slug: 'gmail',
  is_local_toolkit: false,
  composio_managed_auth_schemes: ['OAUTH2'],
  no_auth: false,
  meta: {
    description: 'Email service to send and receive emails',
    categories: [],
    created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
    updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
    available_versions: ['20250101'],
    tools_count: 36,
    triggers_count: 2,
  },
  auth_config_details: [],
};

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
  toolkitsData: { detailedToolkits: [gmail] },
});

const SESSION_TOOLKITS = '/api/v3.1/tool_router/session/trs_stub_session/toolkits';

/** Session toolkit reads answered by `respond`; the session they run in is created normally. */
const toolkitsOver = (respond: () => Response) =>
  stubClientResources(
    ['toolRouter'],
    routeRequests([{ method: 'GET', path: SESSION_TOOLKITS, respond }], () =>
      Response.json({
        session_id: 'trs_stub_session',
        config: { user_id: 'global-default' },
        mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
        tool_router_tools: [],
      })
    )
  );

describe('CLI: composio dev toolkits info over the API client', () => {
  layer(testLayer)('[Given] a session toolkit in a shape the API contract does not allow', it => {
    it.effect('[Then] the toolkit and its connection are shown', () =>
      Effect.gen(function* () {
        // No `meta.logo`, no page counts, and a connected account without
        // `created_at` or `auth_config`.
        const page = {
          items: [
            {
              name: 'Gmail',
              slug: 'gmail',
              enabled: true,
              is_no_auth: false,
              composio_managed_auth_schemes: ['OAUTH2'],
              meta: { description: 'Email service to send and receive emails' },
              connected_account: { id: 'ca_gmail_1', user_id: 'global-default', status: 'ACTIVE' },
            },
          ],
          next_cursor: null,
        };
        const stub = toolkitsOver(() => Response.json(page));
        yield* cli(['dev', 'toolkits', 'info', 'gmail']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Connection Status: ACTIVE');
        expect(output).toContain('Connected Account ID: ca_gmail_1');
        expect(output).toContain('Auth Scheme: -');
        expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({
          slug: 'gmail',
          connected_account: {
            status: 'ACTIVE',
            id: 'ca_gmail_1',
            auth_scheme: null,
            is_composio_managed: null,
          },
        });
        expect(stub.requests.filter(request => request.path.startsWith(SESSION_TOOLKITS))).toEqual([
          { method: 'GET', path: `${SESSION_TOOLKITS}?toolkits=gmail` },
        ]);
      })
    );
  });
});

// The connection status comes from a session in the developer project the command resolved,
// never in the one the backend would pick for the key.
describe('CLI: composio dev toolkits info reads connection status in the developer project', () => {
  const config = ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } });
  const gmailPage = () =>
    Response.json({
      items: [
        {
          name: 'Gmail',
          slug: 'gmail',
          enabled: true,
          is_no_auth: false,
          composio_managed_auth_schemes: ['OAUTH2'],
          meta: { description: 'Email service to send and receive emails', logo: '' },
          connected_account: null,
        },
      ],
      next_cursor: null,
    });

  layer(
    TestLive({
      ...inDeveloperProjectDirectory,
      baseConfigProvider: config,
      toolkitsData: { detailedToolkits: [gmail] },
    })
  )(it => {
    it.effect.each([
      { given: 'a directory set up for a project', args: [], scope: DIRECTORY_PROJECT_SCOPE },
      {
        given: '--project-name',
        args: ['--project-name', OTHER_DEVELOPER_PROJECT.name],
        scope: OTHER_PROJECT_SCOPE,
      },
    ])('[Given] $given [Then] opens its session in that project', ({ args, scope }) =>
      Effect.gen(function* () {
        const stub = toolkitsOver(gmailPage);
        yield* cli(['dev', 'toolkits', 'info', 'gmail', ...args]).pipe(Effect.provide(stub.layer));

        expect(stub.requests.map(request => request.path)).toEqual([
          '/api/v3.1/tool_router/session',
          `${SESSION_TOOLKITS}?toolkits=gmail`,
        ]);
        expect(stub.scopes).toEqual([scope, scope]);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: config,
      toolkitsData: { detailedToolkits: [gmail] },
      accountData: defaultDeveloperProjectAccountData(),
    })
  )(it => {
    it.effect(
      '[Given] --user-id in a directory set up for no project [Then] reads its status in the default developer project, saying so',
      () =>
        Effect.gen(function* () {
          yield* loginWithoutDeveloperProject;
          const stub = toolkitsOver(gmailPage);
          const { exitCode } = yield* cliExit([
            'dev',
            'toolkits',
            'info',
            'gmail',
            '--user-id',
            'alice',
          ]).pipe(Effect.provide(stub.layer));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(exitCode).toBe(0);
          expect(stub.scopes).toEqual([DEFAULT_PROJECT_SCOPE, DEFAULT_PROJECT_SCOPE]);
          expect(lines).toContain(NO_DIRECTORY_PROJECT_NOTICE);
          expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({ slug: 'gmail' });
        })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: config,
      toolkitsData: { detailedToolkits: [gmail] },
    })
  )(it => {
    it.effect(
      '[Given] no user in a directory set up for no project [Then] shows the toolkit without connection status',
      () =>
        Effect.gen(function* () {
          yield* loginWithoutDeveloperProject;
          const stub = toolkitsOver(gmailPage);
          const { exitCode } = yield* cliExit(['dev', 'toolkits', 'info', 'gmail']).pipe(
            Effect.provide(stub.layer)
          );
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(exitCode).toBe(0);
          expect(stub.requests).toEqual([]);
          expect(lines).toContain(
            'No developer project to read connection status from; showing toolkit details without it. Run `composio dev init`, or pass --user-id or --project-name.'
          );
          expect(lines).not.toContain(NO_DIRECTORY_PROJECT_NOTICE);
          expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({ slug: 'gmail' });
        })
    );
  });
});
