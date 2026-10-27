import {
  APIConnectionError,
  Auth,
  make,
  type ComposioClientShape,
  type NotFoundError,
} from '@composio/client/effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Console, DateTime, Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import * as tempy from 'tempy';
import {
  handleBrowserLogin,
  handleDirectLogin,
  handlePollLogin,
  handleSessionKeyLogin,
  runLogin,
  type LoginParams,
} from 'src/commands/login/login.handler';
import {
  AGENT_WITH_OTHER_FLAGS_MESSAGE,
  ALREADY_LOGGED_IN_MESSAGE,
  INVALID_ORGANIZATION_MESSAGE,
  KEY_AND_USER_API_KEY_MESSAGE,
  ORG_WITHOUT_USER_API_KEY_MESSAGE,
  POLL_WITH_OTHER_FLAGS_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
  SESSION_NOT_LINKED_MESSAGE,
  USER_API_KEY_WITH_SESSION_FLAGS_MESSAGE,
} from 'src/commands/login/login.format';
import type { RetrievedSession } from 'src/models/session';
import type { OrganizationSummary } from 'src/services/composio-account';
import { ComposioClientSingleton, ComposioSessionRepository } from 'src/services/composio-clients';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { ProjectContext } from 'src/services/project-context';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { isUsageFailure } from 'src/commands/errors';
import { MockConsole, ToolkitsTest } from 'test/__utils__';
import { notFoundError } from 'test/__utils__/layers/not-found';
import { mockAccountResources, type MockRequestScope } from 'test/__utils__/layers/accounts';
import { PendingLoginSessionTest } from 'test/__utils__/layers/pending-login-session';
import { hostOnlyEnvConfigProvider } from 'test/__utils__/live-env-config-provider';
import { makeSessionInfo } from 'test/__utils__/models/account';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { afterEach, vi } from 'vitest';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

const analytics = vi.hoisted(() => ({ linked: [] as Array<string> }));

// Records each analytics identity link instead of enqueueing an event.
vi.mock('src/analytics/dispatch', async importOriginal => {
  const actual = await importOriginal<typeof import('src/analytics/dispatch')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    analyticsIdentityLinkingEnabled: Effect.succeed(true),
    linkApolloIdentityForAnalytics: ((apolloUserId: string) =>
      Effect.sync(() => {
        analytics.linked.push(apolloUserId);
      })) as unknown as typeof actual.linkApolloIdentityForAnalytics,
  };
});

afterEach(() => {
  analytics.linked.length = 0;
});

const ORGANIZATIONS: ReadonlyArray<OrganizationSummary> = [
  { id: 'org_first', name: 'First Org' },
  { id: 'org_second', name: 'Second Org' },
];

const HOME_SESSION_INFO = makeSessionInfo({
  orgId: 'org_home',
  orgName: 'Home Org',
  orgMemberId: 'member_home',
  email: 'cli@example.com',
});

/** The key's home org without an org scope, otherwise the requested org with its own member. */
const sessionInfoFor = (scope: MockRequestScope) =>
  scope.orgId === undefined
    ? HOME_SESSION_INFO
    : makeSessionInfo({
        orgId: scope.orgId,
        orgName: `${scope.orgId} name`,
        orgMemberId: `member_${scope.orgId}`,
        email: 'cli@example.com',
      });

const params = (overrides: Partial<LoginParams> = {}): LoginParams => ({
  noBrowser: false,
  poll: false,
  noWait: false,
  key: Option.none(),
  userApiKey: Option.none(),
  org: Option.none(),
  yes: false,
  noSkillInstall: true,
  agent: false,
  ...overrides,
});

const pendingSession = (id: string): RetrievedSession => ({
  id,
  code: '001122',
  expiresAt: DateTime.makeUnsafe('2026-01-01T00:10:00.000Z'),
  status: 'pending',
  api_key: null,
});

const linkedSession = (id: string): RetrievedSession => ({
  id,
  code: '001122',
  expiresAt: DateTime.makeUnsafe('2026-01-01T00:10:00.000Z'),
  status: 'linked',
  api_key: 'uak_linked',
  account: { id: 'account_id', name: 'Poll User', email: 'poll@example.com' },
});

interface LoginFixture {
  /** The stored login the user context starts with. */
  readonly apiKey?: Option.Option<string>;
  readonly orgId?: Option.Option<string>;
  readonly pending?: Parameters<typeof PendingLoginSessionTest>[0];
  /** What `getSession` answers; a failure stands for an unknown or expired session. */
  readonly session?: Effect.Effect<RetrievedSession, NotFoundError | APIConnectionError>;
}

// A resource the account mocks do not shadow reaches this transport and dies with its URL.
const baseClient = make(
  {
    auth: Auth.project('test'),
    baseURL: 'https://mock.invalid',
  },
  HttpClient.make(request =>
    Effect.die(new Error(`unexpected network call from the login handler test: ${request.url}`))
  )
);

/**
 * What a login handler needs and nothing more: the account family of the mock client, a CLI
 * session double, an in-memory pending login, a user context that records `login` calls, and a
 * headless terminal whose stdout data lands in `outputs`.
 */
const loginHandlerTest = (fixture: LoginFixture = {}) => {
  const logins: Array<{
    readonly apiKey: string;
    readonly orgId?: string;
    readonly testUserId?: string;
  }> = [];
  const outputs: Array<string> = [];
  const createdSessions: Array<string> = [];
  const pending = PendingLoginSessionTest(fixture.pending);
  const apiKey = fixture.apiKey ?? Option.none();

  const clientFor = (scope: MockRequestScope): ComposioClientShape =>
    // The shadows answer only the fields the handlers read; `test-layer.ts` shadows its mock
    // client the same way.
    ({
      ...baseClient,
      ...mockAccountResources({ sessionInfo: sessionInfoFor, organizations: ORGANIZATIONS }, scope),
    }) as unknown as ComposioClientShape;

  const dir = tempy.temporaryDirectory({ prefix: 'login-handler' });
  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
        capabilities: Effect.succeed(
          getTerminalCapabilities({
            stdin: { isTTY: false },
            stdout: { isTTY: false },
            stderr: { isTTY: false },
          })
        ),
        output: data =>
          Effect.sync(() => {
            outputs.push(data);
          }),
      })
    ),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey,
          baseURL: 'https://mock.invalid',
          webURL: 'https://platform.mock.invalid/',
          orgId: fixture.orgId ?? Option.none(),
          projectId: Option.none(),
          testUserId: Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => Option.isSome(apiKey),
        logout: Effect.void,
        login: (loginApiKey, orgId, testUserId) =>
          Effect.sync(() => {
            logins.push({ apiKey: loginApiKey, orgId, testUserId });
          }),
        update: () => Effect.void,
      })
    ),
    Layer.succeed(
      ComposioSessionRepository,
      ComposioSessionRepository.of({
        createSession: ({ scope } = {}) =>
          Effect.sync(() => {
            createdSessions.push(scope ?? 'user');
            return {
              id: 'session-new',
              code: '001122',
              expiresAt: DateTime.makeUnsafe('2026-01-01T00:10:00.000Z'),
              status: 'pending' as const,
            };
          }),
        getSession: () => fixture.session ?? Effect.succeed(linkedSession('session-key')),
        getRealtimeCredentials: () => Effect.die(new Error('unexpected realtime credentials')),
        authRealtimeChannel: () => Effect.die(new Error('unexpected realtime auth')),
      })
    ),
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(clientFor({})),
        getFor: (scope: MockRequestScope) => Effect.succeed(clientFor(scope)),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    ),
    pending.layer,
    // The consumer-toolkits cache refresh a login starts in the background reads these.
    ToolkitsTest(),
    Layer.succeed(ProjectContext, ProjectContext.of({ resolve: Effect.succeed(Option.none()) })),
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(request =>
        Effect.die(new Error(`unexpected HTTP call from the login handler test: ${request.url}`))
      )
    ),
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
    ConfigProvider.layer(hostOnlyEnvConfigProvider)
  );
  return { layer, logins, outputs, createdSessions, pending };
};

const stderr = MockConsole.getLines({ stream: 'stderr', stripAnsi: true });

describe('runLogin', () => {
  // The checks run in a fixed order; each row also proves the earlier checks let it through.
  it.effect.each([
    {
      name: '--key with --user-api-key',
      flags: { key: Option.some('k'), userApiKey: Option.some('uak') },
      message: KEY_AND_USER_API_KEY_MESSAGE,
      option: undefined,
    },
    {
      name: '--key, --user-api-key and --poll (the pair is reported first)',
      flags: { key: Option.some('k'), userApiKey: Option.some('uak'), poll: true },
      message: KEY_AND_USER_API_KEY_MESSAGE,
      option: undefined,
    },
    {
      name: '--poll with --no-browser',
      flags: { poll: true, noBrowser: true },
      message: POLL_WITH_OTHER_FLAGS_MESSAGE,
      option: '--poll',
    },
    {
      name: '--poll with --user-api-key',
      flags: { poll: true, userApiKey: Option.some('uak') },
      message: POLL_WITH_OTHER_FLAGS_MESSAGE,
      option: '--poll',
    },
    {
      name: '--poll with --agent (before the --agent check)',
      flags: { poll: true, agent: true },
      message: POLL_WITH_OTHER_FLAGS_MESSAGE,
      option: '--poll',
    },
    {
      name: '--agent with --no-wait',
      flags: { agent: true, noWait: true },
      message: AGENT_WITH_OTHER_FLAGS_MESSAGE,
      option: '--agent',
    },
    {
      name: '--agent with --key',
      flags: { agent: true, key: Option.some('k') },
      message: AGENT_WITH_OTHER_FLAGS_MESSAGE,
      option: '--agent',
    },
    {
      name: '--org without --user-api-key',
      flags: { org: Option.some('org_first'), key: Option.some('k') },
      message: ORG_WITHOUT_USER_API_KEY_MESSAGE,
      option: '--org',
    },
    {
      name: '--user-api-key with --no-wait',
      flags: { userApiKey: Option.some('uak'), noWait: true },
      message: USER_API_KEY_WITH_SESSION_FLAGS_MESSAGE,
      option: '--user-api-key',
    },
  ])('[Given] $name [Then] fails with a usage error', ({ flags, message, option }) => {
    const { layer, logins, createdSessions } = loginHandlerTest();
    return Effect.gen(function* () {
      const error = yield* Effect.flip(runLogin(params(flags)));

      expect(error).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'login',
        message,
        option,
      });
      expect(logins).toEqual([]);
      expect(createdSessions).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] --poll and nothing cached [Then] runs the poll flow', () => {
    const { layer } = loginHandlerTest();
    return Effect.gen(function* () {
      const error = yield* Effect.flip(runLogin(params({ poll: true })));

      expect(error).toMatchObject({ _tag: 'commands/PendingLoginError', reason: 'missing' });
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] --user-api-key [Then] runs the direct flow, not the browser one', () => {
    const { layer, logins, createdSessions } = loginHandlerTest();
    return Effect.gen(function* () {
      yield* runLogin(params({ userApiKey: Option.some('uak_direct') }));

      expect(logins.map(login => login.apiKey)).toEqual(['uak_direct']);
      expect(createdSessions).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no flags [Then] runs the browser flow', () => {
    const { layer, createdSessions } = loginHandlerTest();
    return Effect.gen(function* () {
      yield* runLogin(params());

      expect(createdSessions).toEqual(['user']);
    }).pipe(Effect.provide(layer));
  });
});

describe('handlePollLogin', () => {
  it.effect(
    '[Given] a cached login that is linked [Then] stores the first org, clears the cache, and prints the summary JSON',
    () => {
      const { layer, logins, outputs, pending } = loginHandlerTest({
        pending: Option.some({
          key: 'session-key',
          loginUrl: 'https://platform.mock.invalid/?cliKey=session-key',
          expiresAt: '2026-01-01T00:10:00.000Z',
          cachedAt: '2026-01-01T00:00:00.000Z',
        }),
      });
      return Effect.gen(function* () {
        yield* handlePollLogin({ noSkillInstall: true });

        expect(logins).toEqual([
          { apiKey: 'uak_linked', orgId: 'org_first', testUserId: 'pg-test-member_org_first' },
        ]);
        expect(analytics.linked).toEqual(['member_org_first']);
        expect(Option.isNone(pending.current())).toBe(true);
        expect(outputs).toEqual([
          JSON.stringify(
            {
              email: 'poll@example.com',
              current_org: { id: 'org_first', name: 'First Org' },
              organizations: [
                { id: 'org_first', name: 'First Org', selected: true },
                { id: 'org_second', name: 'Second Org', selected: false },
              ],
              switch_command: 'composio orgs switch --org-id <org_id>',
            },
            null,
            2
          ),
        ]);
      }).pipe(Effect.provide(layer));
    }
  );
});

describe('handleSessionKeyLogin', () => {
  it.effect('[Given] an unknown session key [Then] fails to load the session', () => {
    const { layer, logins } = loginHandlerTest({
      session: Effect.fail(notFoundError('session not found')),
    });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true })
      );

      expect(error).toMatchObject({
        _tag: 'commands/LoginSessionError',
        operation: 'load',
        message: SESSION_NOT_FOUND_MESSAGE,
      });
      expect(isUsageFailure(error)).toBe(true);
      expect(logins).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] the session lookup fails to connect [Then] keeps the cause and does not report an expired session',
    () => {
      const connectionError = new APIConnectionError({
        message: 'Connection error.',
        method: 'GET',
        url: 'https://mock.invalid',
        reason: 'TransportError',
        description: 'fetch failed: connect ECONNREFUSED 127.0.0.1:1',
      });
      const { layer, logins } = loginHandlerTest({ session: Effect.fail(connectionError) });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true })
        );

        expect(error).toMatchObject({
          _tag: 'commands/LoginSessionRequestError',
          cause: connectionError,
        });
        expect(error.message).not.toBe(SESSION_NOT_FOUND_MESSAGE);
        expect(isUsageFailure(error)).toBe(false);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] --no-wait and a session still pending [Then] reports it and stores nothing',
    () => {
      const { layer, logins, outputs } = loginHandlerTest({
        session: Effect.succeed(pendingSession('session-key')),
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true })
        );

        expect(error).toMatchObject({
          _tag: 'commands/LoginSessionError',
          operation: 'poll',
          status: 'pending',
        });
        expect(yield* stderr).toContain(SESSION_NOT_LINKED_MESSAGE);
        expect(logins).toEqual([]);
        expect(outputs).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] --no-wait and a linked session [Then] stores the key and prints the login JSON',
    () => {
      const { layer, logins, outputs } = loginHandlerTest();
      return Effect.gen(function* () {
        yield* handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true });

        expect(logins.map(login => login.apiKey)).toEqual(['uak_linked']);
        expect(outputs).toEqual([
          JSON.stringify({ email: 'poll@example.com', org_id: 'org_home', org_name: 'Home Org' }),
        ]);
        expect(analytics.linked).toEqual(['member_org_home']);
      }).pipe(Effect.provide(layer));
    }
  );
});

describe('handleDirectLogin', () => {
  it.effect('[Given] --org naming an org by name [Then] stores that org', () => {
    const { layer, logins, outputs } = loginHandlerTest();
    return Effect.gen(function* () {
      yield* handleDirectLogin({
        userApiKey: 'uak_direct',
        org: Option.some('Second Org'),
        noSkillInstall: true,
      });

      expect(logins).toEqual([
        { apiKey: 'uak_direct', orgId: 'org_second', testUserId: 'pg-test-member_home' },
      ]);
      expect(outputs).toEqual([
        JSON.stringify({ email: 'cli@example.com', org_id: 'org_second', org_name: 'Second Org' }),
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] an empty --org [Then] keeps the home org of the key', () => {
    const { layer, logins } = loginHandlerTest();
    return Effect.gen(function* () {
      yield* handleDirectLogin({
        userApiKey: 'uak_direct',
        org: Option.some(''),
        noSkillInstall: true,
      });

      expect(logins.map(login => login.orgId)).toEqual(['org_home']);
      expect(analytics.linked).toEqual(['member_home']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] --org naming no visible org [Then] fails without storing the key', () => {
    const { layer, logins, outputs } = loginHandlerTest();
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        handleDirectLogin({
          userApiKey: 'uak_direct',
          org: Option.some('Missing Org'),
          noSkillInstall: true,
        })
      );

      expect(error).toMatchObject({
        _tag: 'commands/InvalidOrganizationError',
        message: INVALID_ORGANIZATION_MESSAGE,
        requestedOrg: 'Missing Org',
      });
      expect(yield* stderr).toContain('Organization "Missing Org" was not found for this API key.');
      expect(logins).toEqual([]);
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });
});

describe('handleBrowserLogin', () => {
  it.effect('[Given] a stored login with an org [Then] warns and starts no session', () => {
    const { layer, createdSessions, outputs } = loginHandlerTest({
      apiKey: Option.some('uak_existing'),
      orgId: Option.some('org_existing'),
    });
    return Effect.gen(function* () {
      yield* handleBrowserLogin(params());

      expect(yield* stderr).toContain(ALREADY_LOGGED_IN_MESSAGE);
      expect(createdSessions).toEqual([]);
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] a headless run and no stored agent [Then] caches the session and prints the poll instructions',
    () => {
      const { layer, createdSessions, outputs, pending, logins } = loginHandlerTest();
      return Effect.gen(function* () {
        yield* handleBrowserLogin(params());

        expect(createdSessions).toEqual(['user']);
        expect(pending.current()).toEqual(
          Option.some({
            key: 'session-new',
            loginUrl: 'https://platform.mock.invalid/?cliKey=session-new',
            expiresAt: '2026-01-01T00:10:00.000Z',
            cachedAt: '2026-01-01T00:00:00.000Z',
          })
        );
        expect(outputs).toHaveLength(1);
        expect(outputs[0]).toContain('https://platform.mock.invalid/?cliKey=session-new');
        expect(outputs[0]).toContain('composio login --poll');
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
