import { make, type ComposioClientShape } from '@composio/client/effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Console, Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import * as tempy from 'tempy';
import {
  handleLegacyAuthConfigLink,
  handleListConnectedAccounts,
  handleToolRouterLink,
  runConnectedAccountsLink,
  type ConnectedAccountsLinkParams,
} from 'src/commands/connected-accounts/link/connected-accounts.link.handler';
import {
  AUTH_CONFIG_SCOPE_MESSAGE,
  LIST_REQUIRES_TOOLKIT_MESSAGE,
  LIST_WITH_AUTH_CONFIG_MESSAGE,
  ROOT_AUTH_CONFIG_MESSAGE,
  TOOLKIT_AND_AUTH_CONFIG_MESSAGE,
  missingArgumentMessage,
} from 'src/commands/connected-accounts/link/connected-accounts.link.format';
import { CommandSurface } from 'src/commands/surface';
import { CliUserConfig } from 'src/models/cli-user-config';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import type { ProjectKeys } from 'src/models/project-keys';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { ConnectedAccountsTest, MockConsole } from 'test/__utils__';
import { mockAccountResources, type MockRequestScope } from 'test/__utils__/layers/accounts';
import {
  mockConnectedAccountResources,
  resolveConnectedAccountsTestData,
} from 'test/__utils__/layers/connected-accounts';
import { hostOnlyEnvConfigProvider } from 'test/__utils__/live-env-config-provider';
import { makeOrgProject } from 'test/__utils__/models/account';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

// The consumer project the mock client resolves for `org_test`, and its user.
const CONSUMER_USER_ID = 'consumer-user-org_test';
const DEVELOPER_PROJECT = makeOrgProject({ id: 'proj_named', name: 'named', orgId: 'org_test' });

const account = (overrides: Partial<ConnectedAccountItem> = {}): ConnectedAccountItem => ({
  id: 'con_existing',
  alias: null,
  word_id: 'castle',
  status: 'ACTIVE',
  status_reason: null,
  is_disabled: false,
  user_id: CONSUMER_USER_ID,
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
  ...overrides,
});

const directory = (testUserId: Option.Option<string>): Option.Option<ProjectKeys> =>
  Option.some({
    orgId: 'org_test',
    projectId: 'proj_directory',
    projectName: Option.some('directory'),
    orgName: Option.none(),
    email: Option.none(),
    testUserId,
  });

const params = (
  overrides: Partial<ConnectedAccountsLinkParams> = {}
): ConnectedAccountsLinkParams => ({
  toolkit: Option.none(),
  authConfig: Option.none(),
  noWait: true,
  noBrowser: true,
  alias: Option.none(),
  list: false,
  ...overrides,
});

interface LinkFixture {
  readonly surface?: Layer.Layer<CommandSurface>;
  readonly accounts?: ReadonlyArray<ConnectedAccountItem>;
  readonly directoryProject?: Option.Option<ProjectKeys>;
  readonly globalTestUserId?: Option.Option<string>;
}

/** A request that creates a link, as the mock client saw it. */
interface LinkRequest {
  readonly operation: 'link.create' | 'toolRouter.session.link';
  readonly params: unknown;
}

// A resource neither layer below shadows reaches this transport and dies with its URL.
const baseClient = make(
  {
    apiKey: 'test',
    userApiKey: null,
    orgApiKey: null,
    baseURL: 'https://mock.invalid',
    deprecationNotices: 'off',
  },
  HttpClient.make(request =>
    Effect.die(new Error(`unexpected network call from the link handler test: ${request.url}`))
  )
);

const cliUserConfig = ComposioCliUserConfig.of({
  data: {
    channel: 'beta',
    developerModeEnabled: true,
    developerDangerousCommandsEnabled: false,
    experimentalFeatures: {},
    artifactDirectory: undefined,
    security: 'auto',
  },
  raw: CliUserConfig.make({
    developer: { enabled: true, destructiveActions: false },
    experimentalFeatures: {},
    artifactDirectory: Option.none(),
    security: 'auto',
  }),
  channel: 'beta',
  isDevModeEnabled: () => true,
  areDeveloperDangerousCommandsEnabled: () => false,
  isExperimentalFeatureEnabled: () => true,
  update: () => Effect.void,
});

/**
 * What a link handler needs and nothing more: the account and connected-account families of
 * the mock client (`test/__utils__/layers`), a Tool Router session that answers, and doubles
 * for the user, the directory, and the platform. `requests` records every link request.
 */
const linkHandlerTest = (fixture: LinkFixture = {}) => {
  const requests: Array<LinkRequest> = [];
  const connectedAccounts = mockConnectedAccountResources(
    resolveConnectedAccountsTestData({ items: [...(fixture.accounts ?? [])] })
  );
  const record = (operation: LinkRequest['operation'], requestParams: unknown) =>
    Effect.sync(() => requests.push({ operation, params: requestParams }));
  const clientFor = (scope: MockRequestScope): ComposioClientShape =>
    // The shadows answer only the fields the handlers read, so they do not satisfy the
    // client's full response types; `test-layer.ts` shadows its mock client the same way.
    ({
      ...baseClient,
      ...mockAccountResources({ projects: [DEVELOPER_PROJECT] }, scope),
      ...connectedAccounts,
      link: {
        create: (linkParams: { auth_config_id: string; user_id: string }) =>
          record('link.create', linkParams).pipe(
            Effect.andThen(connectedAccounts.link.create(linkParams))
          ),
      },
      toolRouter: {
        ...baseClient.toolRouter,
        session: {
          ...baseClient.toolRouter.session,
          create: () => Effect.succeed({ session_id: 'trs_handler_test' }),
          link: (sessionId: string, linkParams: { toolkit: string; alias?: string }) =>
            record('toolRouter.session.link', { sessionId, ...linkParams }).pipe(
              Effect.as({
                connected_account_id: 'con_new',
                link_token: 'lt_test',
                redirect_url: 'https://app.composio.dev/link?token=lt_test',
              })
            ),
        },
      },
    }) as unknown as ComposioClientShape;

  const dir = tempy.temporaryDirectory({ prefix: 'link-handler' });
  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    TerminalUITest,
    fixture.surface ?? CommandSurface.root,
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey: Option.some('uak_test'),
          baseURL: 'https://mock.invalid',
          webURL: 'https://platform.mock.invalid',
          orgId: Option.some('org_test'),
          projectId: Option.none(),
          testUserId: fixture.globalTestUserId ?? Option.none(),
        },
        isLoggedIn: () => true,
        logout: Effect.void,
        login: () => Effect.void,
        update: () => Effect.void,
      })
    ),
    Layer.succeed(
      ProjectContext,
      ProjectContext.of({ resolve: Effect.succeed(fixture.directoryProject ?? Option.none()) })
    ),
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(clientFor({})),
        getFor: (scope: MockRequestScope) => Effect.succeed(clientFor(scope)),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    ),
    ConnectedAccountsTest(),
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(
      NodeOs,
      NodeOs.of({ homedir: dir, tmpdir: dir, arch: 'arm64', platform: 'darwin' })
    ),
    Layer.succeed(
      NodeProcess,
      NodeProcess.of({
        cwd: dir,
        execPath: `${dir}/composio`,
        platform: 'darwin',
        arch: 'arm64',
        setExitCode: () => Effect.void,
      })
    ),
    Layer.succeed(ComposioCliUserConfig, cliUserConfig),
    ConfigProvider.layer(hostOnlyEnvConfigProvider)
  );
  return { layer, requests };
};

const lines = MockConsole.getLines({ stripAnsi: true });

/** The command's JSON result: `ui.output` prints it as the last console line. */
const lastJson = lines.pipe(Effect.map(all => JSON.parse(String(all.at(-1))) as unknown));

const devSurface = (flags: { userId?: string; projectName?: string } = {}) =>
  CommandSurface.dev({
    userId: Option.fromUndefinedOr(flags.userId),
    projectName: Option.fromUndefinedOr(flags.projectName),
  });

describe('connected-accounts link handler: runConnectedAccountsLink', () => {
  it.effect.each([
    {
      name: 'a blank --alias, before any other check',
      surface: CommandSurface.root,
      input: { alias: Option.some('  '), authConfig: Option.some('ac_1') },
      option: '--alias',
      message: '`--alias` cannot be empty.',
    },
    {
      name: '--auth-config on the root tree, which is consumer-only',
      surface: CommandSurface.root,
      input: { toolkit: Option.some('gmail'), authConfig: Option.some('ac_1') },
      option: '--auth-config',
      message: ROOT_AUTH_CONFIG_MESSAGE,
    },
  ])('[Given] $name [Then] fails with a CommandInputError and sends nothing', c =>
    Effect.gen(function* () {
      const { layer, requests } = linkHandlerTest({ surface: c.surface });
      const error = yield* runConnectedAccountsLink(params(c.input)).pipe(
        Effect.flip,
        Effect.provide(layer)
      );

      expect(error).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'link',
        option: c.option,
        message: c.message,
      });
      expect(requests).toEqual([]);
    })
  );

  it.effect.each([
    {
      name: 'a toolkit and --auth-config under dev',
      surface: devSurface(),
      input: { toolkit: Option.some('gmail'), authConfig: Option.some('ac_1') },
      message: TOOLKIT_AND_AUTH_CONFIG_MESSAGE,
    },
    {
      name: 'neither a toolkit nor --auth-config on the root tree',
      surface: CommandSurface.root,
      input: {},
      message: missingArgumentMessage('root'),
    },
    {
      name: 'neither a toolkit nor --auth-config under dev',
      surface: devSurface(),
      input: {},
      message: missingArgumentMessage('dev'),
    },
  ])('[Given] $name [Then] prints the usage message and exits 0', c =>
    Effect.gen(function* () {
      const { layer, requests } = linkHandlerTest({ surface: c.surface });
      const output = yield* runConnectedAccountsLink(params(c.input)).pipe(
        Effect.andThen(lines),
        Effect.provide(layer)
      );

      expect(output).toEqual([c.message]);
      expect(requests).toEqual([]);
    })
  );

  it.effect.each([
    {
      flow: 'list',
      input: { toolkit: Option.some('gmail'), list: true },
      expected: { toolkit: 'gmail', total: 1 },
    },
    {
      flow: 'legacy',
      input: { authConfig: Option.some('ac_gmail') },
      expected: { status: 'pending', connected_account_id: 'con_test_link' },
    },
    {
      flow: 'tool-router',
      input: { toolkit: Option.some('gmail') },
      expected: { status: 'pending', connected_account_id: 'con_new', toolkit: 'gmail' },
    },
  ])('[Given] the flags select the $flow flow [Then] it runs that flow', c =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({
        surface: devSurface({ userId: 'user_1' }),
        accounts: [account({ alias: 'work' })],
        directoryProject: directory(Option.none()),
      });
      const result = yield* runConnectedAccountsLink(
        params({ ...c.input, alias: Option.some('second') })
      ).pipe(Effect.andThen(lastJson), Effect.provide(layer));

      expect(result).toMatchObject(c.expected);
    })
  );
});

describe('connected-accounts link handler: handleListConnectedAccounts', () => {
  it.effect.each([
    {
      name: 'no toolkit',
      input: { list: true, authConfig: Option.some('ac_1') },
      message: LIST_REQUIRES_TOOLKIT_MESSAGE,
    },
    {
      name: '--auth-config',
      input: { list: true, toolkit: Option.some('gmail'), authConfig: Option.some('ac_1') },
      message: LIST_WITH_AUTH_CONFIG_MESSAGE,
    },
  ])('[Given] $name [Then] prints why --list cannot run', c =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest();
      const output = yield* handleListConnectedAccounts(params(c.input)).pipe(
        Effect.andThen(lines),
        Effect.provide(layer)
      );

      expect(output).toEqual([c.message]);
    })
  );

  it.effect('[Given] the consumer project [Then] lists only its user’s active accounts', () =>
    Effect.gen(function* () {
      const mine = account();
      const { layer } = linkHandlerTest({
        accounts: [
          mine,
          account({ id: 'con_other_user', user_id: 'someone-else' }),
          account({ id: 'con_inactive', status: 'INITIATED' }),
          account({ id: 'con_other_toolkit', toolkit: { slug: 'slack' } }),
        ],
      });
      const result = yield* handleListConnectedAccounts(
        params({ toolkit: Option.some('gmail'), list: true })
      ).pipe(Effect.andThen(lastJson), Effect.provide(layer));

      expect(result).toStrictEqual({ toolkit: 'gmail', total: 1, items: [mine] });
    })
  );

  it.effect('[Given] no active account [Then] warns and prints an empty list', () =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest();
      const output = yield* handleListConnectedAccounts(
        params({ toolkit: Option.some('gmail'), list: true })
      ).pipe(Effect.andThen(lines), Effect.provide(layer));

      expect(output.at(-2)).toBe('No active connected accounts found for "gmail".');
      expect(JSON.parse(String(output.at(-1)))).toStrictEqual({
        toolkit: 'gmail',
        items: [],
        total: 0,
      });
    })
  );

  it.effect.each([
    {
      name: '--user-id',
      surface: devSurface({ projectName: 'named', userId: 'user_flag' }),
      directoryProject: directory(Option.some('user_directory')),
      expectedUser: 'user_flag',
    },
    {
      name: 'the directory’s test user, for the directory’s own project',
      surface: devSurface({ projectName: 'named' }),
      directoryProject: Option.map(directory(Option.some('user_directory')), keys => ({
        ...keys,
        projectId: DEVELOPER_PROJECT.id,
      })),
      expectedUser: 'user_directory',
    },
    {
      name: 'the global test user, for a project other than the directory’s',
      surface: devSurface({ projectName: 'named' }),
      directoryProject: directory(Option.some('user_directory')),
      expectedUser: 'user_global',
    },
  ])('[Given] dev --project-name and $name [Then] lists that user’s accounts', c =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({
        surface: c.surface,
        directoryProject: c.directoryProject,
        globalTestUserId: Option.some('user_global'),
        accounts: ['user_flag', 'user_directory', 'user_global'].map(userId =>
          account({ id: `con_${userId}`, user_id: userId })
        ),
      });
      const result = yield* handleListConnectedAccounts(
        params({ toolkit: Option.some('gmail'), list: true })
      ).pipe(Effect.andThen(lastJson), Effect.provide(layer));

      expect(result).toMatchObject({ total: 1, items: [{ user_id: c.expectedUser }] });
    })
  );

  it.effect(
    '[Given] dev --project-name and no user anywhere [Then] fails pointing at --user-id',
    () =>
      Effect.gen(function* () {
        const { layer } = linkHandlerTest({ surface: devSurface({ projectName: 'named' }) });
        const error = yield* handleListConnectedAccounts(
          params({ toolkit: Option.some('gmail'), list: true })
        ).pipe(Effect.flip, Effect.provide(layer));

        expect(error).toMatchObject({
          _tag: 'commands/MissingLinkUserIdError',
          flow: 'list',
          message:
            'Missing user id. Provide --user-id, or run `composio login` to store a global test user id.',
        });
      })
  );
});

describe('connected-accounts link handler: handleLegacyAuthConfigLink', () => {
  it.effect(
    '[Given] the directory’s test user [Then] links it in the directory’s project and prints the pending link',
    () =>
      Effect.gen(function* () {
        const { layer, requests } = linkHandlerTest({
          surface: devSurface(),
          directoryProject: directory(Option.some('user_directory')),
        });
        const output = yield* handleLegacyAuthConfigLink(
          params({ authConfig: Option.some('ac_gmail') })
        ).pipe(Effect.andThen(lines), Effect.provide(layer));

        expect(output[0]).toBe('Using test user id "user_directory"');
        expect(requests).toEqual([
          {
            operation: 'link.create',
            params: { auth_config_id: 'ac_gmail', user_id: 'user_directory' },
          },
        ]);
        expect(JSON.parse(String(output.at(-1)))).toStrictEqual({
          status: 'pending',
          message: 'Complete authorization by opening the URL',
          connected_account_id: 'con_test_link',
          redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
          project_type: 'DEVELOPER',
        });
      })
  );

  it.effect('[Given] no user anywhere [Then] fails pointing at dev init', () =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({
        surface: devSurface(),
        directoryProject: directory(Option.none()),
      });
      const error = yield* handleLegacyAuthConfigLink(
        params({ authConfig: Option.some('ac_gmail') })
      ).pipe(Effect.flip, Effect.provide(layer));

      expect(error).toMatchObject({
        _tag: 'commands/MissingLinkUserIdError',
        flow: 'legacy',
        message: 'Missing user id. Provide --user-id or run composio dev init to set test_user_id.',
      });
    })
  );

  it.effect('[Given] no developer project [Then] explains the scope and sends nothing', () =>
    Effect.gen(function* () {
      const { layer, requests } = linkHandlerTest({ surface: devSurface({ userId: 'user_1' }) });
      const output = yield* handleLegacyAuthConfigLink(
        params({ authConfig: Option.some('ac_gmail') })
      ).pipe(Effect.andThen(lines), Effect.provide(layer));

      expect(output).toEqual([AUTH_CONFIG_SCOPE_MESSAGE]);
      expect(requests).toEqual([]);
    })
  );

  it.effect(
    '[Given] an alias already in use [Then] points at the dev commands and sends nothing',
    () =>
      Effect.gen(function* () {
        const { layer, requests } = linkHandlerTest({
          surface: devSurface({ userId: 'user_1' }),
          directoryProject: directory(Option.none()),
          accounts: [account({ user_id: 'user_1', alias: 'Work' })],
        });
        const output = yield* handleLegacyAuthConfigLink(
          params({ authConfig: Option.some('ac_gmail'), alias: Option.some(' work ') })
        ).pipe(Effect.andThen(lines), Effect.provide(layer));

        expect(output).toEqual([
          'Alias "work" is already in use by connected account "con_existing".',
          "[Tips] Use the existing alias: composio dev playground-execute <TOOL_SLUG> --account work -d '{ ... }'\nList connected accounts: composio dev connected-accounts list",
        ]);
        expect(requests).toEqual([]);
      })
  );
});

describe('connected-accounts link handler: handleToolRouterLink', () => {
  it.effect(
    '[Given] the consumer project and --alias [Then] links with the alias and prints the pending link',
    () =>
      Effect.gen(function* () {
        const { layer, requests } = linkHandlerTest({ accounts: [account()] });
        const result = yield* handleToolRouterLink(
          params({ toolkit: Option.some('gmail'), alias: Option.some(' work ') })
        ).pipe(Effect.andThen(lastJson), Effect.provide(layer));

        expect(requests).toEqual([
          {
            operation: 'toolRouter.session.link',
            params: { sessionId: 'trs_handler_test', toolkit: 'gmail', alias: 'work' },
          },
        ]);
        expect(result).toStrictEqual({
          status: 'pending',
          message: 'Complete authorization by opening the URL',
          connected_account_id: 'con_new',
          redirect_url: 'https://app.composio.dev/link?token=lt_test',
          toolkit: 'gmail',
          project_type: 'CONSUMER',
        });
      })
  );

  it.effect('[Given] an active account and no --alias [Then] lists it and prints no link', () =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({ accounts: [account({ alias: 'default' })] });
      const output = yield* handleToolRouterLink(params({ toolkit: Option.some('gmail') })).pipe(
        Effect.andThen(lines),
        Effect.provide(layer)
      );

      expect(output.slice(-2)).toEqual([
        `A connected account already exists for user "${CONSUMER_USER_ID}" in toolkit "gmail". Pass --alias to create another one.`,
        '[Existing accounts] con_existing (default, castle)',
      ]);
    })
  );
});
