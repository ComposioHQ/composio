import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect, Layer, Option } from 'effect';
import { cli, cliExit, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits } from 'src/models/toolkits';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { notFoundError } from 'test/__utils__/layers/not-found';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';
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
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

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

const SESSION_TOOLKITS_PATH = '/api/v3.1/tool_router/session/trs_stub_session/toolkits';

/** A tool router whose session toolkits call answers with `respondToolkits`. */
const stubSessionToolkits = (respondToolkits: () => Response) =>
  stubClientResources(
    ['toolRouter'],
    routeRequests([{ method: 'GET', path: SESSION_TOOLKITS_PATH, respond: respondToolkits }], () =>
      Response.json({
        session_id: 'trs_stub_session',
        config: { user_id: 'global-default' },
        mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
        tool_router_tools: [],
      })
    )
  );

const sessionToolkit = (slug: string, name: string, status: string | null) => ({
  slug,
  name,
  meta: { description: '', logo: '' },
  is_no_auth: false,
  enabled: true,
  composio_managed_auth_schemes: ['OAUTH2'],
  connected_account:
    status === null
      ? null
      : {
          id: `ca_${slug}`,
          status,
          auth_config: { id: `ac_${slug}`, auth_scheme: 'OAUTH2', is_composio_managed: true },
        },
});

const forbidden = () =>
  Response.json(
    { error: { message: 'Not allowed', code: 1403, slug: 'Forbidden', status: 403 } },
    { status: 403 }
  );

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

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      accountData: defaultDeveloperProjectAccountData(),
    })
  )('[Given] explicit --user-id [Then] shows connected status column', it => {
    it.effect('shows connected column with explicit user id', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'list', '--user-id', 'default']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Connected');
        expect(output).toContain('Listing 3 of 3 toolkits');
      })
    );
  });

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

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      fixture: 'global-test-user-id',
    })
  )('[Given] --connected and a session with one active connection', it => {
    it.effect('[Then] only the connected toolkit is listed', () =>
      Effect.gen(function* () {
        const stub = stubSessionToolkits(() =>
          Response.json({
            items: [
              sessionToolkit('gmail', 'Gmail', 'ACTIVE'),
              sessionToolkit('slack', 'Slack', 'EXPIRED'),
              sessionToolkit('github', 'GitHub', null),
            ],
            next_cursor: null,
            total_pages: 1,
            current_page: 1,
            total_items: 3,
          })
        );
        yield* cli(['dev', 'toolkits', 'list', '--connected']).pipe(Effect.provide(stub.layer));
        const stderr = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' });
        const stdout = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' });

        expect(stderr.join('\n')).toContain('Listing 1 of 3 toolkits');
        expect(stdout).toHaveLength(1);
        expect(JSON.parse(String(stdout[0]))).toEqual([
          expect.objectContaining({
            slug: 'gmail',
            connected: {
              status: 'ACTIVE',
              id: 'ca_gmail',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
            },
          }),
        ]);
        expect(stub.requests.at(-1)?.path).toBe(
          `${SESSION_TOOLKITS_PATH}?limit=30&is_connected=true`
        );
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      fixture: 'global-test-user-id',
    })
  )('[Given] --connected and the API rejects the session toolkits', it => {
    it.effect('[Then] the filter is reported as skipped and every toolkit is listed', () =>
      Effect.gen(function* () {
        const stub = stubSessionToolkits(forbidden);
        yield* cli(['dev', 'toolkits', 'list', '--connected']).pipe(Effect.provide(stub.layer));
        const stderr = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' });
        const stdout = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' });

        expect(stderr).toContain(
          '`--connected` filter could not be applied — session data unavailable.'
        );
        expect(
          (JSON.parse(String(stdout.at(-1))) as Array<{ slug: string }>).map(row => row.slug)
        ).toEqual(['gmail', 'slack', 'github']);
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --connected and no user id anywhere',
    it => {
      it.effect('[Then] warns that the filter needs a user id and lists the catalog', () =>
        Effect.gen(function* () {
          // Logged in without a global test user, in a directory whose project has none either.
          yield* loginWithoutDeveloperProject;
          const directoryProject = Layer.succeed(
            ProjectContext,
            ProjectContext.of({
              resolve: Effect.succeedSome({
                ...DIRECTORY_PROJECT_SCOPE,
                projectName: Option.none(),
                orgName: Option.none(),
                email: Option.none(),
                testUserId: Option.none(),
              }),
            })
          );
          yield* cli(['dev', 'toolkits', 'list', '--connected']).pipe(
            Effect.provide(directoryProject)
          );
          const stderr = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' });
          const stdout = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' });

          expect(stderr[0]).toBe(
            '`--connected` requires a user id. Use `--user-id` or run `composio dev init`.'
          );
          expect(stderr.join('\n')).toContain('Listing 3 of 3 toolkits');
          expect(
            (JSON.parse(String(stdout.at(-1))) as Array<{ slug: string }>).map(row => row.slug)
          ).toEqual(['gmail', 'slack', 'github']);
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] the catalog request fails',
    it => {
      it.effect('[Then] prints the error, writes `[]` to stdout and exits 1', () =>
        Effect.gen(function* () {
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              searchToolkits: () => Effect.fail(notFoundError('Catalog unavailable')),
            })
          );
          // Redirected streams, as under a script: only plain stderr lines and stdout data show.
          const terminal = redirectedTerminalUI();
          const exit = yield* Effect.exit(
            cli(['dev', 'toolkits', 'list']).pipe(
              Effect.provide(Layer.mergeAll(repository, terminal.layer))
            )
          );

          expect(terminal.stderr()).toBe('Catalog unavailable\n');
          expect(terminal.stdout()).toBe('[]\n');
          expect(exitCodeOf(exit)).toBe(1);
        })
      );
    }
  );

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

// The connection status comes from a session in the developer project the command resolved,
// never in the one the backend would pick for the key.
describe('CLI: composio dev toolkits list reads connection status in the developer project', () => {
  const emptyPage = () =>
    Response.json({
      items: [],
      next_cursor: null,
      total_pages: 1,
      current_page: 1,
      total_items: 0,
    });

  layer(
    TestLive({
      ...inDeveloperProjectDirectory,
      baseConfigProvider: testConfigProvider,
      toolkitsData,
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
        const stub = stubSessionToolkits(emptyPage);
        yield* cli(['dev', 'toolkits', 'list', ...args]).pipe(Effect.provide(stub.layer));

        expect(stub.requests.map(request => request.path)).toEqual([
          '/api/v3.1/tool_router/session',
          `${SESSION_TOOLKITS_PATH}?limit=30`,
        ]);
        expect(stub.scopes).toEqual([scope, scope]);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      accountData: defaultDeveloperProjectAccountData(),
    })
  )(it => {
    it.effect(
      '[Given] --user-id in a directory set up for no project [Then] opens its session in the default developer project, saying so',
      () =>
        Effect.gen(function* () {
          yield* loginWithoutDeveloperProject;
          const stub = stubSessionToolkits(emptyPage);
          const { exitCode } = yield* cliExit([
            'dev',
            'toolkits',
            'list',
            '--user-id',
            'alice',
          ]).pipe(Effect.provide(stub.layer));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(exitCode).toBe(0);
          expect(stub.scopes).toEqual([DEFAULT_PROJECT_SCOPE, DEFAULT_PROJECT_SCOPE]);
          expect(lines).toContain(NO_DIRECTORY_PROJECT_NOTICE);
          expect(lines.join('\n')).toContain('Listing 3 of 3 toolkits');
        })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(it => {
    it.effect(
      '[Given] no user in a directory set up for no project [Then] lists the catalog without connection status',
      () =>
        Effect.gen(function* () {
          yield* loginWithoutDeveloperProject;
          const stub = stubSessionToolkits(emptyPage);
          const { exitCode } = yield* cliExit(['dev', 'toolkits', 'list']).pipe(
            Effect.provide(stub.layer)
          );
          const lines = yield* MockConsole.getLines({ stripAnsi: true });

          expect(exitCode).toBe(0);
          expect(stub.requests).toEqual([]);
          expect(lines).toContain(
            'No developer project to read connection status from; showing toolkits without it. Run `composio dev init`, or pass --user-id or --project-name.'
          );
          expect(lines).not.toContain(NO_DIRECTORY_PROJECT_NOTICE);
        })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(it => {
    it.effect(
      '[Given] --connected in a directory set up for no project [Then] warns that the filter needs a developer project and lists the catalog',
      () =>
        Effect.gen(function* () {
          yield* loginWithoutDeveloperProject;
          const stub = stubSessionToolkits(emptyPage);
          const { exitCode } = yield* cliExit(['dev', 'toolkits', 'list', '--connected']).pipe(
            Effect.provide(stub.layer)
          );
          const stderr = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' });

          expect(exitCode).toBe(0);
          expect(stub.requests).toEqual([]);
          expect(stderr).toContain(
            '`--connected` requires a developer project. Run `composio dev init` or pass --project-name.'
          );
          expect(stderr.join('\n')).not.toContain('`--connected` requires a user id.');
          expect(stderr.join('\n')).toContain('Listing 3 of 3 toolkits');
        })
    );
  });
});
