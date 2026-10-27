import { Auth, make, type ComposioClientShape } from '@composio/client/effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Console, Effect, Fiber, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';
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
  BROWSE_AUTH_CONFIGS_HINT,
  BROWSE_TOOLKITS_HINT,
  INCOMPLETE_LINK_RESPONSE_MESSAGE,
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
import type { TerminalUI } from 'src/services/terminal-ui';
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
import { recordingNodeProcess } from 'test/__utils__/services/node-process-test';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';
import open from 'open';
import { afterEach, vi } from 'vitest';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

afterEach(() => {
  vi.clearAllMocks();
});

// The consumer project the mock client resolves for `org_test`, and its user.
const CONSUMER_USER_ID = 'consumer-user-org_test';
const DEVELOPER_PROJECT = makeOrgProject({ id: 'proj_named', name: 'named', orgId: 'org_test' });

const account = (overrides: Partial<ConnectedAccountItem> = {}): ConnectedAccountItem => ({
  id: 'con_existing',
  // `word_id` precedes `alias` to match the model's field order, which is the order the
  // decoded items carry into the `--list` payload asserted as a raw string below.
  word_id: 'castle',
  alias: null,
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
  /** Replaces the `link.create` answer, e.g. to fail it. */
  readonly legacyLinkCreate?: () => Effect.Effect<unknown, unknown>;
  /** Replaces the `toolRouter.session.link` answer, e.g. to fail it or drop a field. */
  readonly toolRouterLink?: () => Effect.Effect<unknown, unknown>;
  /** Makes `connectedAccounts.list` fail, to prove the alias-hints fetch is auxiliary. */
  readonly connectedAccountsListFails?: boolean;
  /** Makes the first N `connectedAccounts.retrieve` calls fail, for the polling retries. */
  readonly retrieveFailsFirst?: number;
  /** The consumer project's user id; the mock client's default otherwise. */
  readonly consumerUserId?: string;
  /** Replaces the headless test terminal, e.g. with `redirectedTerminalUI`. */
  readonly terminal?: Layer.Layer<TerminalUI>;
}

/** A request that creates a link, as the mock client saw it. */
interface LinkRequest {
  readonly operation: 'link.create' | 'toolRouter.session.link';
  readonly params: unknown;
}

// A resource neither layer below shadows reaches this transport and dies with its URL.
const baseClient = make(
  {
    auth: Auth.project('test'),
    baseURL: 'https://mock.invalid',
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
 * for the user, the directory, and the platform. `requests` records every link request, and
 * `exitCode` the exit code a handler sets.
 */
const linkHandlerTest = (fixture: LinkFixture = {}) => {
  const requests: Array<LinkRequest> = [];
  /** The `user_id` of every Tool Router session the handler created. */
  const sessionUsers: Array<string> = [];
  const connectedAccounts = mockConnectedAccountResources(
    resolveConnectedAccountsTestData({ items: [...(fixture.accounts ?? [])] })
  );
  let retrieveAttempts = 0;
  const connectedAccountsResources = {
    ...connectedAccounts,
    connectedAccounts: {
      ...connectedAccounts.connectedAccounts,
      list: fixture.connectedAccountsListFails
        ? () => Effect.fail(new Error('connectedAccounts.list is down'))
        : connectedAccounts.connectedAccounts.list,
      retrieve: (nanoid: string) => {
        retrieveAttempts += 1;
        return retrieveAttempts <= (fixture.retrieveFailsFirst ?? 0)
          ? Effect.fail(new Error(`transient retrieve failure ${retrieveAttempts}`))
          : connectedAccounts.connectedAccounts.retrieve(nanoid);
      },
    },
  };
  const record = (operation: LinkRequest['operation'], requestParams: unknown) =>
    Effect.sync(() => requests.push({ operation, params: requestParams }));
  const clientFor = (scope: MockRequestScope): ComposioClientShape =>
    // The shadows answer only the fields the handlers read, so they do not satisfy the
    // client's full response types; `test-layer.ts` shadows its mock client the same way.
    ({
      ...baseClient,
      ...mockAccountResources(
        { projects: [DEVELOPER_PROJECT], consumerUserId: fixture.consumerUserId },
        scope
      ),
      ...connectedAccountsResources,
      link: {
        create: (linkParams: { auth_config_id: string; user_id: string }) =>
          record('link.create', linkParams).pipe(
            Effect.andThen(
              fixture.legacyLinkCreate
                ? fixture.legacyLinkCreate()
                : connectedAccounts.link.create(linkParams)
            )
          ),
      },
      toolRouter: {
        ...baseClient.toolRouter,
        session: {
          ...baseClient.toolRouter.session,
          create: (sessionParams: { user_id: string }) =>
            Effect.sync(() => sessionUsers.push(sessionParams.user_id)).pipe(
              Effect.as({ session_id: 'trs_handler_test' })
            ),
          link: (sessionId: string, linkParams: { toolkit: string; alias?: string }) =>
            record('toolRouter.session.link', { sessionId, ...linkParams }).pipe(
              Effect.andThen(
                fixture.toolRouterLink
                  ? fixture.toolRouterLink()
                  : Effect.succeed({
                      connected_account_id: 'con_new',
                      link_token: 'lt_test',
                      redirect_url: 'https://app.composio.dev/link?token=lt_test',
                    })
              )
            ),
        },
      },
    }) as unknown as ComposioClientShape;

  const dir = tempy.temporaryDirectory({ prefix: 'link-handler' });
  const proc = recordingNodeProcess(dir);
  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    fixture.terminal ?? TerminalUITest,
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
        backendMismatch: Option.none(),
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
    proc.layer,
    Layer.succeed(ComposioCliUserConfig, cliUserConfig),
    ConfigProvider.layer(hostOnlyEnvConfigProvider)
  );
  return { layer, requests, sessionUsers, exitCode: proc.exitCode };
};

const lines = MockConsole.getLines({ stripAnsi: true });

/** The command's JSON result: `ui.output` prints it as the last console line. */
const lastJson = lines.pipe(Effect.map(all => JSON.parse(String(all.at(-1))) as unknown));

/** The payload as `link` prints it: a `toStdoutJson` string, key order included. */
const toJson = (payload: object) => JSON.stringify(payload, null, 2);

/** The `link.create` answer of the mock connected-account resources. */
const LEGACY_LINK_TARGET = {
  connected_account_id: 'con_test_link',
  redirect_url: 'https://app.composio.dev/link?token=lt_test_token',
} as const;

/** The `toolRouter.session.link` answer of the handler test's client double. */
const TOOL_ROUTER_LINK_TARGET = {
  connected_account_id: 'con_new',
  redirect_url: 'https://app.composio.dev/link?token=lt_test',
} as const;

/** The pending payload of a legacy link, byte for byte. */
const legacyPendingJson = () =>
  toJson({
    status: 'pending',
    message: 'Complete authorization by opening the URL',
    connected_account_id: LEGACY_LINK_TARGET.connected_account_id,
    redirect_url: LEGACY_LINK_TARGET.redirect_url,
    project_type: 'DEVELOPER',
  });

/** The pending payload of a Tool Router link, byte for byte. */
const toolRouterPendingJson = (projectType: 'CONSUMER' | 'DEVELOPER' = 'CONSUMER') =>
  toJson({
    status: 'pending',
    message: 'Complete authorization by opening the URL',
    connected_account_id: TOOL_ROUTER_LINK_TARGET.connected_account_id,
    redirect_url: TOOL_ROUTER_LINK_TARGET.redirect_url,
    toolkit: 'gmail',
    project_type: projectType,
  });

/** The payload once polling saw `con_new` ACTIVE, byte for byte. */
const toolRouterActiveJson = () =>
  toJson({
    status: 'success',
    message: 'Connected account "con_new" is now ACTIVE (toolkit: gmail).',
    connected_account_id: 'con_new',
    toolkit: 'gmail',
    redirect_url: TOOL_ROUTER_LINK_TARGET.redirect_url,
  });

/**
 * Runs an effect whose context is already provided on the test clock, with a pump fiber that
 * keeps advancing the clock while it runs: every pump iteration lets the effect reach its next
 * scheduled sleep, then moves the clock past it. Answers what the effect answered once done.
 */
const runWithAdvancingClock = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const run = yield* Effect.forkChild(effect);
    const pump = yield* Effect.forkChild(
      Effect.forever(Effect.andThen(Effect.yieldNow, () => TestClock.adjust('10 seconds')))
    );
    const result = yield* Fiber.join(run);
    yield* Fiber.interrupt(pump);
    return result;
  });

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
      command: 'link',
    },
    {
      name: '--auth-config on the root tree, which is consumer-only',
      surface: CommandSurface.root,
      input: { toolkit: Option.some('gmail'), authConfig: Option.some('ac_1') },
      option: '--auth-config',
      message: ROOT_AUTH_CONFIG_MESSAGE,
      command: 'link',
    },
    {
      name: 'a toolkit and --auth-config under dev',
      surface: devSurface(),
      input: { toolkit: Option.some('gmail'), authConfig: Option.some('ac_1') },
      option: '--auth-config',
      message: TOOLKIT_AND_AUTH_CONFIG_MESSAGE,
      command: 'dev connected-accounts link',
    },
    {
      name: 'neither a toolkit nor --auth-config on the root tree',
      surface: CommandSurface.root,
      input: {},
      option: '<toolkit>',
      message: missingArgumentMessage('root'),
      command: 'link',
    },
    {
      name: 'neither a toolkit nor --auth-config under dev',
      surface: devSurface(),
      input: {},
      option: '<toolkit>',
      message: missingArgumentMessage('dev'),
      command: 'dev connected-accounts link',
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
        command: c.command,
        option: c.option,
        message: c.message,
      });
      expect(requests).toEqual([]);
    })
  );

  it.effect.each([
    { flow: 'list', input: { toolkit: Option.some('gmail'), list: true } },
    { flow: 'legacy', input: { authConfig: Option.some('ac_gmail') } },
    { flow: 'tool-router', input: { toolkit: Option.some('gmail') } },
  ])('[Given] the flags select the $flow flow [Then] it runs that flow', c =>
    Effect.gen(function* () {
      // On the dev tree every flow acts as --user-id on the directory's developer project.
      const fixtureAccount = account({ alias: 'work', user_id: 'user_1' });
      const { layer } = linkHandlerTest({
        surface: devSurface({ userId: 'user_1' }),
        accounts: [fixtureAccount],
        directoryProject: directory(Option.none()),
      });
      const lastLine = yield* runConnectedAccountsLink(
        params({ ...c.input, alias: Option.some('second') })
      ).pipe(
        Effect.andThen(lines),
        Effect.map(all => String(all.at(-1))),
        Effect.provide(layer)
      );

      // The raw string, not JSON.parse, so a key reorder fails here.
      expect(lastLine).toBe(
        c.flow === 'list'
          ? toJson({ toolkit: 'gmail', total: 1, items: [fixtureAccount] })
          : c.flow === 'legacy'
            ? legacyPendingJson()
            : toolRouterPendingJson('DEVELOPER')
      );
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
  ])('[Given] $name [Then] fails with a CommandInputError saying why --list cannot run', c =>
    Effect.gen(function* () {
      const { layer, requests } = linkHandlerTest();
      const error = yield* handleListConnectedAccounts(params(c.input)).pipe(
        Effect.flip,
        Effect.provide(layer)
      );

      expect(error).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'link',
        option: '--list',
        message: c.message,
      });
      expect(requests).toEqual([]);
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
      // The empty case lists `items` before `total`; this pins that order.
      expect(String(output.at(-1))).toBe(toJson({ toolkit: 'gmail', items: [], total: 0 }));
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

  it.effect.each([
    { name: '--user-id', userId: 'user_flag', expectedUser: 'user_flag' },
    { name: 'the directory’s test user', userId: undefined, expectedUser: 'user_directory' },
  ])(
    '[Given] dev without --project-name and $name [Then] lists that user’s accounts in the directory’s project',
    c =>
      Effect.gen(function* () {
        const { layer } = linkHandlerTest({
          surface: devSurface({ userId: c.userId }),
          directoryProject: directory(Option.some('user_directory')),
          accounts: [CONSUMER_USER_ID, 'user_flag', 'user_directory'].map(userId =>
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
    '[Given] dev without --project-name outside a developer project [Then] fails with ProjectResolutionError',
    () =>
      Effect.gen(function* () {
        const { layer, requests } = linkHandlerTest({
          surface: devSurface({ userId: 'user_flag' }),
        });
        const error = yield* handleListConnectedAccounts(
          params({ toolkit: Option.some('gmail'), list: true })
        ).pipe(Effect.flip, Effect.provide(layer));

        expect(error).toMatchObject({
          _tag: 'services/ProjectResolutionError',
          reason: 'missing_developer_project',
        });
        expect(requests).toEqual([]);
      })
  );

  it.effect('[Given] the list request fails [Then] fails with the request error', () =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({ connectedAccountsListFails: true });
      const error = yield* handleListConnectedAccounts(
        params({ toolkit: Option.some('gmail'), list: true })
      ).pipe(Effect.flip, Effect.provide(layer));

      expect(error).toMatchObject({
        _tag: 'commands/ConnectedAccountsRequestError',
        message: 'Failed to list connected accounts for "gmail".',
      });
    })
  );

  it.effect.each([
    {
      tree: 'root',
      surface: CommandSurface.root,
      message: 'Missing consumer user id. Run `composio login` and try again.',
    },
    {
      tree: 'dev',
      surface: devSurface(),
      message:
        'Missing user id. Provide --user-id or run `composio dev init` to set a playground test user id.',
    },
  ])('[Given] no user on the $tree tree [Then] fails with that tree’s message', c =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({
        surface: c.surface,
        directoryProject: directory(Option.none()),
        consumerUserId: '',
      });
      const error = yield* handleToolRouterLink(params({ toolkit: Option.some('gmail') })).pipe(
        Effect.flip,
        Effect.provide(layer)
      );

      expect(error).toMatchObject({ message: c.message });
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
        expect(String(output.at(-1))).toBe(legacyPendingJson());
      })
  );

  it.effect('[Given] no --auth-config [Then] fails with a usage error and sends nothing', () =>
    Effect.gen(function* () {
      const { layer, requests } = linkHandlerTest({ surface: devSurface() });
      const error = yield* handleLegacyAuthConfigLink(params()).pipe(
        Effect.flip,
        Effect.provide(layer)
      );

      expect(error).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'dev connected-accounts link',
        option: '--auth-config',
        message: missingArgumentMessage('dev'),
      });
      expect(requests).toEqual([]);
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
        message:
          'Missing user id. Provide --user-id or run `composio dev init` to set a playground test user id.',
      });
    })
  );

  it.effect(
    '[Given] no developer project and no user [Then] reports the missing project first',
    () =>
      Effect.gen(function* () {
        const { layer, requests } = linkHandlerTest({ surface: devSurface() });
        const error = yield* handleLegacyAuthConfigLink(
          params({ authConfig: Option.some('ac_gmail') })
        ).pipe(Effect.flip, Effect.provide(layer));

        expect(error).toMatchObject({
          _tag: 'commands/CommandInputError',
          option: '--auth-config',
          message: AUTH_CONFIG_SCOPE_MESSAGE,
        });
        expect(requests).toEqual([]);
      })
  );

  it.effect(
    '[Given] no developer project [Then] fails with a CommandInputError explaining the scope and sends nothing',
    () =>
      Effect.gen(function* () {
        const { layer, requests } = linkHandlerTest({ surface: devSurface({ userId: 'user_1' }) });
        const error = yield* handleLegacyAuthConfigLink(
          params({ authConfig: Option.some('ac_gmail') })
        ).pipe(Effect.flip, Effect.provide(layer));

        expect(error).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'dev connected-accounts link',
          option: '--auth-config',
          message: AUTH_CONFIG_SCOPE_MESSAGE,
        });
        expect(requests).toEqual([]);
      })
  );

  it.effect(
    '[Given] the link request fails [Then] reports the message and the auth-config hint, and exits 1',
    () =>
      Effect.gen(function* () {
        const { layer, requests, exitCode } = linkHandlerTest({
          surface: devSurface({ userId: 'user_1' }),
          directoryProject: directory(Option.none()),
          legacyLinkCreate: () => Effect.fail(new Error('quota exhausted')),
        });
        const output = yield* handleLegacyAuthConfigLink(
          params({ authConfig: Option.some('ac_gmail') })
        ).pipe(Effect.andThen(lines), Effect.provide(layer));

        expect(output).toEqual(['quota exhausted', BROWSE_AUTH_CONFIGS_HINT]);
        expect(exitCode()).toBe(1);
        expect(requests).toEqual([
          {
            operation: 'link.create',
            params: { auth_config_id: 'ac_gmail', user_id: 'user_1' },
          },
        ]);
      })
  );

  it.effect(
    '[Given] an alias already in use [Then] points at the dev commands, sends nothing, and exits 1',
    () =>
      Effect.gen(function* () {
        const { layer, requests, exitCode } = linkHandlerTest({
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
        expect(exitCode()).toBe(1);
        expect(requests).toEqual([]);
      })
  );
});

describe('connected-accounts link handler: handleToolRouterLink', () => {
  it.effect.each([
    { name: '--user-id', userId: 'user_flag', expectedUser: 'user_flag' },
    { name: 'the directory’s test user', userId: undefined, expectedUser: 'user_directory' },
  ])(
    '[Given] dev without --project-name and $name [Then] links that user in the directory’s project',
    c =>
      Effect.gen(function* () {
        const { layer, sessionUsers } = linkHandlerTest({
          surface: devSurface({ userId: c.userId }),
          directoryProject: directory(Option.some('user_directory')),
          globalTestUserId: Option.some('user_global'),
        });
        const output = yield* handleToolRouterLink(params({ toolkit: Option.some('gmail') })).pipe(
          Effect.andThen(lines),
          Effect.provide(layer)
        );

        expect(sessionUsers).toEqual([c.expectedUser]);
        expect(String(output.at(-1))).toBe(toolRouterPendingJson('DEVELOPER'));
      })
  );

  it.effect(
    '[Given] dev and an alias already in use [Then] points at the dev commands and sends nothing',
    () =>
      Effect.gen(function* () {
        const { layer, requests } = linkHandlerTest({
          surface: devSurface({ userId: 'user_1' }),
          directoryProject: directory(Option.none()),
          accounts: [account({ user_id: 'user_1', alias: 'Work' })],
        });
        const output = yield* handleToolRouterLink(
          params({ toolkit: Option.some('gmail'), alias: Option.some('work') })
        ).pipe(Effect.andThen(lines), Effect.provide(layer));

        expect(output).toEqual([
          'Alias "work" is already in use by connected account "con_existing".',
          "[Tips] Use the existing alias: composio dev playground-execute <TOOL_SLUG> --account work -d '{ ... }'\nList connected accounts: composio dev connected-accounts list --toolkits gmail",
        ]);
        expect(requests).toEqual([]);
      })
  );

  it.effect(
    '[Given] the consumer project and --alias [Then] links with the alias and prints the pending link',
    () =>
      Effect.gen(function* () {
        const { layer, requests, exitCode } = linkHandlerTest({ accounts: [account()] });
        const output = yield* handleToolRouterLink(
          params({ toolkit: Option.some('gmail'), alias: Option.some(' work ') })
        ).pipe(Effect.andThen(lines), Effect.provide(layer));

        expect(requests).toEqual([
          {
            operation: 'toolRouter.session.link',
            params: { sessionId: 'trs_handler_test', toolkit: 'gmail', alias: 'work' },
          },
        ]);
        expect(String(output.at(-1))).toBe(toolRouterPendingJson());
        expect(exitCode()).toBeUndefined();
      })
  );

  it.effect(
    '[Given] no --no-wait [Then] polls the account to ACTIVE and prints the active payload',
    () =>
      Effect.gen(function* () {
        // `retrieve('con_new')` answers from the fixture, so polling succeeds on its first try.
        const { layer } = linkHandlerTest({
          accounts: [
            account({ id: 'con_new', user_id: 'poll-source', alias: null, word_id: null }),
          ],
        });
        const output = yield* handleToolRouterLink(
          params({ toolkit: Option.some('gmail'), noWait: false })
        ).pipe(Effect.andThen(lines), Effect.provide(layer));

        expect(output).toContain('Connection successful');
        expect(String(output.at(-1))).toBe(toolRouterActiveJson());
      })
  );

  it.effect(
    '[Given] the link returns the existing account [Then] no --alias is needed to reuse it',
    () =>
      Effect.gen(function* () {
        // The fixture account is both the hints entry and the link answer, so the
        // additional-account guard lets the same account through.
        const { layer } = linkHandlerTest({ accounts: [account({ id: 'con_new' })] });
        const lastLine = yield* handleToolRouterLink(
          params({ toolkit: Option.some('gmail') })
        ).pipe(
          Effect.andThen(lines),
          Effect.map(all => String(all.at(-1))),
          Effect.provide(layer)
        );

        expect(lastLine).toBe(toolRouterPendingJson());
      })
  );

  it.effect('[Given] the alias-hints list request fails [Then] the link still runs', () =>
    Effect.gen(function* () {
      const { layer, requests } = linkHandlerTest({ connectedAccountsListFails: true });
      const lastLine = yield* handleToolRouterLink(params({ toolkit: Option.some('gmail') })).pipe(
        Effect.andThen(lines),
        Effect.map(all => String(all.at(-1))),
        Effect.provide(layer)
      );

      expect(requests).toEqual([
        {
          operation: 'toolRouter.session.link',
          params: { sessionId: 'trs_handler_test', toolkit: 'gmail' },
        },
      ]);
      expect(lastLine).toBe(toolRouterPendingJson());
    })
  );

  it.effect('[Given] the link request fails [Then] reports the cause and the browse hint', () =>
    Effect.gen(function* () {
      const terminal = redirectedTerminalUI();
      const { layer, exitCode } = linkHandlerTest({
        toolRouterLink: () => Effect.fail(new Error('offline')),
        terminal: terminal.layer,
      });
      yield* handleToolRouterLink(params({ toolkit: Option.some('gmail') })).pipe(
        Effect.provide(layer)
      );

      // `failedWith` keeps the client error in `.cause`, and the message prefers it. Plain
      // lines, so a script, CI or an agent reading a redirected stderr sees them.
      expect(terminal.stderr()).toBe(`offline\n${BROWSE_TOOLKITS_HINT}\n`);
      expect(terminal.stdout()).toBe('');
      expect(exitCode()).toBe(1);
    })
  );

  it.effect('[Given] an incomplete link response [Then] reports it and exits 1', () =>
    Effect.gen(function* () {
      const { layer, exitCode } = linkHandlerTest({
        toolRouterLink: () =>
          Effect.succeed({ connected_account_id: 'con_new', link_token: 'lt', redirect_url: '' }),
      });
      const output = yield* handleToolRouterLink(params({ toolkit: Option.some('gmail') })).pipe(
        Effect.andThen(lines),
        Effect.provide(layer)
      );

      expect(output).toEqual(['Linking gmail...', INCOMPLETE_LINK_RESPONSE_MESSAGE]);
      expect(exitCode()).toBe(1);
    })
  );

  it.effect('[Given] no toolkit [Then] fails with a usage error and sends nothing', () =>
    Effect.gen(function* () {
      const { layer, requests } = linkHandlerTest();
      const error = yield* handleToolRouterLink(params()).pipe(Effect.flip, Effect.provide(layer));

      expect(error).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'link',
        option: '<toolkit>',
        message: missingArgumentMessage('root'),
      });
      expect(requests).toEqual([]);
    })
  );

  it.effect('[Given] a redirect URL without an http scheme [Then] warns and still waits', () =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({
        accounts: [account({ id: 'con_new', user_id: 'poll-source', alias: null, word_id: null })],
        toolRouterLink: () =>
          Effect.succeed({ connected_account_id: 'con_new', redirect_url: 'notaurl' }),
      });
      const output = yield* handleToolRouterLink(
        params({ toolkit: Option.some('gmail'), noWait: false })
      ).pipe(Effect.andThen(lines), Effect.provide(layer));

      expect(output).toEqual([
        'Linking gmail...',
        'Open this URL in your browser to authorize',
        '[Redirect URL] notaurl',
        'Redirect URL has an unexpected scheme: notaurl',
        'Open the URL manually if you trust the source.',
        'Connection successful',
        'Connected account "con_new" is now ACTIVE (toolkit: gmail).',
        toJson({
          status: 'success',
          message: 'Connected account "con_new" is now ACTIVE (toolkit: gmail).',
          connected_account_id: 'con_new',
          toolkit: 'gmail',
          redirect_url: 'notaurl',
        }),
      ]);
      expect(vi.mocked(open)).not.toHaveBeenCalled();
    })
  );

  it.effect('[Given] the browser fails to open [Then] points at the URL and still waits', () =>
    Effect.gen(function* () {
      vi.mocked(open).mockRejectedValueOnce(new Error('no browser'));
      const { layer } = linkHandlerTest({
        accounts: [account({ id: 'con_new', user_id: 'poll-source', alias: null, word_id: null })],
      });
      const output = yield* handleToolRouterLink(
        params({ toolkit: Option.some('gmail'), noWait: false, noBrowser: false })
      ).pipe(Effect.andThen(lines), Effect.provide(layer));

      expect(vi.mocked(open)).toHaveBeenCalledWith(TOOL_ROUTER_LINK_TARGET.redirect_url, {
        wait: false,
      });
      expect(output).toEqual([
        'Linking gmail...',
        'Redirecting you to the authorization page',
        `[Redirect URL] ${TOOL_ROUTER_LINK_TARGET.redirect_url}`,
        'Could not open the browser automatically.',
        'Open the URL above manually.',
        'Connection successful',
        'Connected account "con_new" is now ACTIVE (toolkit: gmail).',
        toolRouterActiveJson(),
      ]);
    })
  );

  it.effect('[Given] one failed poll [Then] retries and still reaches ACTIVE', () =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({
        accounts: [account({ id: 'con_new', user_id: 'poll-source', alias: null, word_id: null })],
        retrieveFailsFirst: 1,
      });
      const lastLine = yield* runWithAdvancingClock(
        handleToolRouterLink(params({ toolkit: Option.some('gmail'), noWait: false })).pipe(
          Effect.andThen(lines),
          Effect.map(all => String(all.at(-1))),
          Effect.provide(layer)
        )
      );

      expect(lastLine).toBe(toolRouterActiveJson());
    })
  );

  it.effect('[Given] the account never turns ACTIVE [Then] gives up and reports the timeout', () =>
    Effect.gen(function* () {
      const { layer } = linkHandlerTest({
        accounts: [account({ id: 'con_new', user_id: 'poll-source', status: 'INITIATED' })],
      });
      const error = yield* runWithAdvancingClock(
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            handleToolRouterLink(params({ toolkit: Option.some('gmail'), noWait: false }))
          );
          const output = yield* lines;
          return { error, output };
        }).pipe(Effect.provide(layer))
      );

      expect(error.error).toMatchObject({
        _tag: 'commands/ConnectionPollingError',
        connectedAccountId: 'con_new',
        status: 'INITIATED',
      });
      expect(error.output).not.toContain('Connection successful');
      expect(String(error.output.at(-1))).toBe(
        'Timed out waiting for authorization. Run the command again.'
      );
    })
  );

  it.effect(
    '[Given] an active account and no --alias [Then] lists it, prints no link, and exits 1',
    () =>
      Effect.gen(function* () {
        const { layer, exitCode } = linkHandlerTest({ accounts: [account({ alias: 'default' })] });
        const output = yield* handleToolRouterLink(params({ toolkit: Option.some('gmail') })).pipe(
          Effect.andThen(lines),
          Effect.provide(layer)
        );

        expect(output.slice(-2)).toEqual([
          `A connected account already exists for user "${CONSUMER_USER_ID}" in toolkit "gmail". Pass --alias to create another one.`,
          '[Existing accounts] con_existing (default, castle)',
        ]);
        expect(exitCode()).toBe(1);
      })
  );
});
