import {
  APIConnectionError,
  APIError,
  Auth,
  AuthenticationError,
  ConflictError,
  make,
  type ComposioClientShape,
} from '@composio/client/effect';
import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { Clock, ConfigProvider, Console, DateTime, Effect, Fiber, Layer, Option } from 'effect';
import { Base64Url } from 'effect/encoding';
import { HttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';
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
  KEY_NOT_PENDING_MESSAGE,
  ORG_WITHOUT_USER_API_KEY_MESSAGE,
  OUTDATED_PENDING_LOGIN_MESSAGE,
  POLL_WITH_OTHER_FLAGS_MESSAGE,
  SESSION_NOT_LINKED_MESSAGE,
  USER_API_KEY_WITH_SESSION_FLAGS_MESSAGE,
} from 'src/commands/login/login.format';
import {
  LOGIN_ALREADY_ISSUED_MESSAGE,
  LOGIN_EXPIRED_MESSAGE,
  LOGIN_LINK_CONFLICT_MESSAGE,
  LOGIN_PROOF_NOT_ACKNOWLEDGED_MESSAGE,
  LOGIN_PROOF_REJECTED_MESSAGE,
  LOGIN_SESSION_NOT_FOUND_MESSAGE,
} from 'src/effects/browser-login';
import type { RetrievedSession } from 'src/models/session';
import type { OrganizationSummary } from 'src/services/composio-account';
import {
  ComposioClientSingleton,
  ComposioSessionRepository,
  type ComposioSessionRepositoryShape,
} from 'src/services/composio-clients';
import {
  PendingLoginError,
  PendingLoginSession,
  type PendingLogin,
} from 'src/services/pending-login-session';
import { writeStoredAgentIdentity } from 'src/services/agents';
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
import { agentsJsonResponse, makeAgentIdentity } from 'test/__utils__/models/agent';
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
  vi.restoreAllMocks();
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

/** Sessions expire ten minutes after the test clock's start. */
const EXPIRES_AT = '1970-01-01T00:10:00.000Z';
const VERIFIER = 'dGVzdC12ZXJpZmllci1mb3ItdGhlLWxvZ2luLXRlc3Q';

const pendingSession = (id: string): RetrievedSession => ({
  id,
  code: '001122',
  expiresAt: DateTime.makeUnsafe(EXPIRES_AT),
  status: 'pending',
  api_key: null,
});

const linkedSession = (id: string): RetrievedSession => ({
  id,
  code: '001122',
  expiresAt: DateTime.makeUnsafe(EXPIRES_AT),
  status: 'linked',
  api_key: 'uak_linked',
  account: { id: 'account_id', name: 'Poll User', email: 'poll@example.com' },
});

/** The login `composio login --no-wait` cached for `session-key`. */
const cachedLogin = (overrides: Partial<PendingLogin> = {}): Option.Option<PendingLogin> =>
  Option.some({
    key: 'session-key',
    loginUrl: 'https://platform.mock.invalid/?cliKey=session-key',
    expiresAt: EXPIRES_AT,
    cachedAt: '1970-01-01T00:00:00.000Z',
    verifier: VERIFIER,
    ...overrides,
  });

/** The S256 challenge of `verifier`, through Web Crypto rather than the CLI's own helper. */
const s256 = (verifier: string) =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).pipe(
    Effect.map(digest => Base64Url.encode(new Uint8Array(digest)))
  );

/** The login another terminal's `composio login --no-wait` caches while this one waits. */
const OTHER_LOGIN: PendingLogin = {
  key: 'session-other',
  loginUrl: 'https://platform.mock.invalid/?cliKey=session-other',
  expiresAt: EXPIRES_AT,
  cachedAt: '2026-01-01T00:00:00.000Z',
  verifier: 'b3RoZXItdGVybWluYWwtdmVyaWZpZXItZm9yLXRlc3Q',
};

/** Runs `self` with session lookups that each let another terminal cache `OTHER_LOGIN` first. */
const whileAnotherTerminalCaches = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const pendingLogin = yield* PendingLoginSession;
    const repository = yield* ComposioSessionRepository;
    const { cachedAt: _cachedAt, ...started } = OTHER_LOGIN;
    return yield* Effect.provideService(
      self,
      ComposioSessionRepository,
      ComposioSessionRepository.of({
        ...repository,
        getSession: request =>
          Effect.orDie(pendingLogin.write(started)).pipe(
            Effect.andThen(repository.getSession(request))
          ),
      })
    );
  });

/** A `get-session` failure with `status`, as the Effect client reports it. */
const sessionFailure = (
  status: 401 | 409 | 410,
  envelope: { readonly slug: string; readonly code: number; readonly message: string }
) => {
  const fields = {
    message: `${status} ${envelope.message}`,
    method: 'GET',
    url: 'https://mock.invalid/api/v3.1/cli/get-session',
    status,
    requestId: undefined,
    details: { ...envelope, status },
    body: { error: { ...envelope, status } },
  };
  return status === 401
    ? new AuthenticationError(fields)
    : status === 409
      ? new ConflictError(fields)
      : new APIError(fields);
};

/** Runs `self` while moving the test clock a poll interval at a time, until it settles. */
const whilePolling = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(self);
    yield* Effect.yieldNow.pipe(
      Effect.andThen(TestClock.adjust('5 seconds')),
      Effect.repeat({ until: () => fiber.pollUnsafe() !== undefined, times: 200 })
    );
    return yield* Fiber.join(fiber);
  });

type GetSession = ReturnType<ComposioSessionRepositoryShape['getSession']>;

interface LoginFixture {
  /** The stored login the user context starts with. */
  readonly apiKey?: Option.Option<string>;
  readonly orgId?: Option.Option<string>;
  readonly pending?: Parameters<typeof PendingLoginSessionTest>[0];
  /** What `getSession` answers; a failure stands for the API's answer to a bad lookup. */
  readonly session?: GetSession;
  /** What `create-session` echoes as `code_challenge_method`; `S256` unless set. */
  readonly challengeMethod?: string | null;
  /** stdin and stderr are terminals, so the login waits instead of printing instructions. */
  readonly interactive?: boolean;
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
  const challenges: Array<string> = [];
  const sessionRequests: Array<{ readonly id: string; readonly verifier: string }> = [];
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
            stdin: { isTTY: fixture.interactive === true },
            stdout: { isTTY: false },
            stderr: { isTTY: fixture.interactive === true },
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
        createSession: ({ scope, codeChallenge }) =>
          Effect.sync(() => {
            createdSessions.push(scope);
            challenges.push(codeChallenge);
            return {
              id: 'session-new',
              code: '001122',
              expiresAt: DateTime.makeUnsafe(EXPIRES_AT),
              status: 'pending' as const,
              ...(fixture.challengeMethod === null
                ? {}
                : { code_challenge_method: fixture.challengeMethod ?? 'S256' }),
            };
          }),
        getSession: request =>
          Effect.suspend(() => {
            sessionRequests.push(request);
            return fixture.session ?? Effect.succeed(linkedSession(request.id));
          }),
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
    BunCrypto.layer,
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
      })
    ),
    ConfigProvider.layer(hostOnlyEnvConfigProvider)
  );
  return { layer, logins, outputs, createdSessions, challenges, sessionRequests, pending };
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
    '[Given] a cached login that is linked [Then] polls with its verifier, stores the first org, clears the cache, and prints the summary JSON',
    () => {
      const { layer, logins, outputs, pending, sessionRequests } = loginHandlerTest({
        pending: cachedLogin(),
      });
      return Effect.gen(function* () {
        yield* handlePollLogin({ noSkillInstall: true });

        expect(sessionRequests).toEqual([{ id: 'session-key', verifier: VERIFIER }]);
        expect(logins).toEqual([
          { apiKey: 'uak_linked', orgId: 'org_first', testUserId: 'pg-test-member_org_first' },
        ]);
        expect(analytics.linked).toEqual(['member_org_first']);
        expect(Option.isNone(pending.current())).toBe(true);
        expect(outputs).toEqual([
          JSON.stringify(
            {
              email: 'cli@example.com',
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

  it.effect(
    '[Given] another terminal caches its own login while --poll waits [Then] completes this login and keeps the other one cached',
    () => {
      const { layer, logins, pending } = loginHandlerTest({ pending: cachedLogin() });
      return Effect.gen(function* () {
        yield* whileAnotherTerminalCaches(handlePollLogin({ noSkillInstall: true }));

        expect(logins.map(login => login.apiKey)).toEqual(['uak_linked']);
        expect(pending.current()).toEqual(Option.some(OTHER_LOGIN));
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] a cached login is completed while stderr is not a terminal [Then] names the account from session info on stderr',
    () => {
      const { layer } = loginHandlerTest({ pending: cachedLogin() });
      return Effect.gen(function* () {
        yield* handlePollLogin({ noSkillInstall: true });

        expect(yield* stderr).toContain('Logged in as cli@example.com (First Org)');
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] a cached login an older CLI wrote without a verifier [Then] fails with the expected start-a-new-login error and sends nothing',
    () => {
      const { layer, logins, sessionRequests } = loginHandlerTest({
        pending: cachedLogin({ verifier: undefined }),
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(handlePollLogin({ noSkillInstall: true }));

        expect(error).toMatchObject({
          _tag: 'commands/PendingLoginError',
          reason: 'outdated',
          message: OUTDATED_PENDING_LOGIN_MESSAGE,
        });
        expect(isUsageFailure(error)).toBe(true);
        expect(sessionRequests).toEqual([]);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect.each([
    {
      name: 'a rejected proof (401)',
      failure: sessionFailure(401, {
        slug: 'CLI_SessionProofInvalid',
        code: 2105,
        message: 'Invalid session proof',
      }),
      reason: 'proof-rejected',
      message: LOGIN_PROOF_REJECTED_MESSAGE,
    },
    {
      name: 'a session that is gone (404)',
      failure: notFoundError('session not found'),
      reason: 'not-found',
      message: LOGIN_SESSION_NOT_FOUND_MESSAGE,
    },
    {
      name: 'a key already issued (409)',
      failure: sessionFailure(409, {
        slug: 'CLI_SessionAlreadyIssued',
        code: 2103,
        message: 'Key already issued',
      }),
      reason: 'already-issued',
      message: LOGIN_ALREADY_ISSUED_MESSAGE,
    },
    {
      name: 'a login another account approved (409 link conflict)',
      failure: sessionFailure(409, {
        slug: 'CLI_SessionLinkConflict',
        code: 2107,
        message: 'Session linked by another account',
      }),
      reason: 'link-conflict',
      message: LOGIN_LINK_CONFLICT_MESSAGE,
    },
    {
      name: 'a CLI past its sunset (410)',
      failure: sessionFailure(410, {
        slug: 'CLI_LoginUpgradeRequired',
        code: 2106,
        message: 'Run `composio upgrade` to keep logging in.',
      }),
      reason: 'upgrade-required',
      message: 'Run `composio upgrade` to keep logging in.',
    },
  ])(
    '[Given] get-session answers with $name [Then] stops after that one call with its message and clears the cache',
    ({ failure, reason, message }) => {
      const { layer, logins, pending, sessionRequests } = loginHandlerTest({
        pending: cachedLogin(),
        session: Effect.fail(failure),
      });
      return Effect.gen(function* () {
        const error = yield* whilePolling(Effect.flip(handlePollLogin({ noSkillInstall: true })));

        expect(error).toMatchObject({ _tag: 'commands/LoginSessionEndedError', reason, message });
        expect(isUsageFailure(error)).toBe(true);
        expect(sessionRequests).toHaveLength(1);
        expect(Option.isNone(pending.current())).toBe(true);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] the login is approved seven minutes in [Then] the next poll collects it before the session expires',
    () => {
      // Pending until minute 7, linked after, and gone once the session expires at minute 10.
      const session = Effect.flatMap(Clock.currentTimeMillis, now =>
        now >= 10 * 60_000
          ? Effect.fail(notFoundError('session expired'))
          : Effect.succeed(
              now >= 7 * 60_000 ? linkedSession('session-key') : pendingSession('session-key')
            )
      );
      const { layer, logins, pending } = loginHandlerTest({ pending: cachedLogin(), session });
      return Effect.gen(function* () {
        yield* whilePolling(handlePollLogin({ noSkillInstall: true }));

        expect(logins.map(login => login.apiKey)).toEqual(['uak_linked']);
        expect(Option.isNone(pending.current())).toBe(true);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] the login is never approved [Then] polls every five seconds until it expires, then fails and clears the cache',
    () => {
      const { layer, logins, pending, sessionRequests } = loginHandlerTest({
        pending: cachedLogin(),
        session: Effect.succeed(pendingSession('session-key')),
      });
      return Effect.gen(function* () {
        const error = yield* whilePolling(Effect.flip(handlePollLogin({ noSkillInstall: true })));

        expect(error).toMatchObject({
          _tag: 'commands/LoginSessionEndedError',
          reason: 'expired',
          message: LOGIN_EXPIRED_MESSAGE,
        });
        // One check at the start and one every five seconds until the ten-minute expiry.
        expect(sessionRequests).toHaveLength(121);
        expect(Option.isNone(pending.current())).toBe(true);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] every session lookup fails to connect until the login expires [Then] keeps retrying, then fails with the request error and its cause, and keeps the cache',
    () => {
      const connectionError = new APIConnectionError({
        message: 'Connection error.',
        method: 'GET',
        url: 'https://mock.invalid',
        reason: 'TransportError',
        description: 'fetch failed: connect ECONNREFUSED 127.0.0.1:1',
      });
      const { layer, logins, pending, sessionRequests } = loginHandlerTest({
        pending: cachedLogin(),
        session: Effect.fail(connectionError),
      });
      return Effect.gen(function* () {
        const error = yield* whilePolling(Effect.flip(handlePollLogin({ noSkillInstall: true })));

        expect(error).toMatchObject({
          _tag: 'commands/LoginSessionRequestError',
          cause: connectionError,
        });
        expect(isUsageFailure(error)).toBe(false);
        expect(sessionRequests).toHaveLength(121);
        expect(Option.isSome(pending.current())).toBe(true);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});

describe('login --agent', () => {
  it.effect(
    '[Given] a stored READY agent identity while stderr is not a terminal [Then] names the agent account on stderr',
    () => {
      const { layer, outputs } = loginHandlerTest();
      return Effect.gen(function* () {
        yield* writeStoredAgentIdentity(makeAgentIdentity());
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
          agentsJsonResponse(makeAgentIdentity())
        );

        yield* runLogin(params({ agent: true }));

        expect(yield* stderr).toContain('Logged in as Composio agent test-agent@agent.composio.ai');
        expect(outputs.map(output => JSON.parse(output))).toEqual([
          expect.objectContaining({ account_type: 'agent', logged_in: true }),
        ]);
      }).pipe(Effect.provide(layer));
    }
  );
});

describe('handleSessionKeyLogin', () => {
  it.effect(
    '[Given] --key with the cached session id [Then] polls with the cached verifier, stores the key, and clears the cache',
    () => {
      const { layer, logins, outputs, pending, sessionRequests } = loginHandlerTest({
        pending: cachedLogin(),
      });
      return Effect.gen(function* () {
        yield* handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true });

        expect(sessionRequests).toEqual([{ id: 'session-key', verifier: VERIFIER }]);
        expect(logins.map(login => login.apiKey)).toEqual(['uak_linked']);
        expect(outputs).toEqual([
          JSON.stringify({ email: 'cli@example.com', org_id: 'org_home', org_name: 'Home Org' }),
        ]);
        expect(analytics.linked).toEqual(['member_org_home']);
        expect(Option.isNone(pending.current())).toBe(true);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect.each([
    { name: 'another session id is cached', pending: cachedLogin({ key: 'session-other' }) },
    { name: 'nothing is cached', pending: Option.none<PendingLogin>() },
  ])(
    '[Given] --key while $name [Then] fails with the expected --key error and sends nothing',
    ({ pending }) => {
      const { layer, logins, sessionRequests } = loginHandlerTest({ pending });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true })
        );

        expect(error).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'login',
          option: '--key',
          message: KEY_NOT_PENDING_MESSAGE,
        });
        expect(sessionRequests).toEqual([]);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] --key after the cached login expired [Then] fails with the expired-login error, not the --poll hint, and sends nothing',
    () => {
      const expired = new PendingLoginError({
        message: 'Pending login expired. Run `composio login < /dev/null` again.',
        reason: 'expired',
      });
      const { layer, logins, sessionRequests } = loginHandlerTest();
      const expiredPending = Layer.succeed(
        PendingLoginSession,
        PendingLoginSession.of({
          write: () => Effect.void,
          read: Effect.fail(expired),
          clear: () => Effect.void,
        })
      );
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true })
        );

        expect(error).toBe(expired);
        expect(isUsageFailure(error)).toBe(true);
        expect(sessionRequests).toEqual([]);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(expiredPending), Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] the session lookup fails to connect [Then] keeps the cause, keeps the cache, and does not report an ended login',
    () => {
      const connectionError = new APIConnectionError({
        message: 'Connection error.',
        method: 'GET',
        url: 'https://mock.invalid',
        reason: 'TransportError',
        description: 'fetch failed: connect ECONNREFUSED 127.0.0.1:1',
      });
      const { layer, logins, pending } = loginHandlerTest({
        pending: cachedLogin(),
        session: Effect.fail(connectionError),
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true })
        );

        expect(error).toMatchObject({
          _tag: 'commands/LoginSessionRequestError',
          cause: connectionError,
        });
        expect(isUsageFailure(error)).toBe(false);
        expect(Option.isSome(pending.current())).toBe(true);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] --no-wait and a session still pending [Then] reports it, keeps the cache, and stores nothing',
    () => {
      const { layer, logins, outputs, pending } = loginHandlerTest({
        pending: cachedLogin(),
        session: Effect.succeed(pendingSession('session-key')),
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleSessionKeyLogin({ key: 'session-key', noWait: true, noSkillInstall: true })
        );

        expect(error).toMatchObject({ _tag: 'commands/LoginSessionError', status: 'pending' });
        expect(yield* stderr).toContain(SESSION_NOT_LINKED_MESSAGE);
        expect(Option.isSome(pending.current())).toBe(true);
        expect(logins).toEqual([]);
        expect(outputs).toEqual([]);
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

  it.effect(
    '[Given] a user API key while stderr is not a terminal [Then] names the account on stderr',
    () => {
      const { layer } = loginHandlerTest();
      return Effect.gen(function* () {
        yield* handleDirectLogin({
          userApiKey: 'uak_direct',
          org: Option.none(),
          noSkillInstall: true,
        });

        expect(yield* stderr).toContain('Logged in as cli@example.com (Home Org)');
      }).pipe(Effect.provide(layer));
    }
  );

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
    '[Given] a headless run and no stored agent [Then] creates a proof-bound session, caches its verifier, and prints the poll instructions with the confirmation code',
    () => {
      const { layer, createdSessions, challenges, outputs, pending, logins } = loginHandlerTest();
      return Effect.gen(function* () {
        yield* handleBrowserLogin(params());

        expect(createdSessions).toEqual(['user']);
        const cached = Option.getOrThrow(pending.current());
        const verifier = cached.verifier ?? '';
        expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(challenges).toEqual([yield* s256(verifier)]);
        expect(cached).toEqual({
          key: 'session-new',
          loginUrl: 'https://platform.mock.invalid/?cliKey=session-new',
          expiresAt: EXPIRES_AT,
          cachedAt: '2026-01-01T00:00:00.000Z',
          verifier,
        });
        expect(outputs).toHaveLength(1);
        expect(outputs[0]).toContain('Open this URL in your browser to log in:');
        expect(outputs[0]).toContain('https://platform.mock.invalid/?cliKey=session-new');
        expect(outputs[0]).toContain('Confirmation code: 001122');
        expect(outputs[0]).toContain('composio login --poll');
        expect(outputs[0]).toContain('For unattended agents');
        expect(outputs[0]).toContain('composio login --agent');
        expect(outputs[0]).not.toContain(verifier);
        expect((yield* MockConsole.getLines()).join('\n')).not.toContain(verifier);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] create-session does not echo the challenge method [Then] fails closed, naming --user-api-key, and caches nothing',
    () => {
      const { layer, outputs, pending, logins } = loginHandlerTest({ challengeMethod: null });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(handleBrowserLogin(params()));

        expect(error).toMatchObject({
          _tag: 'commands/LoginProofNotAcknowledgedError',
          message: LOGIN_PROOF_NOT_ACKNOWLEDGED_MESSAGE,
        });
        expect(error.message).toContain('composio login --user-api-key');
        expect(isUsageFailure(error)).toBe(true);
        expect(Option.isNone(pending.current())).toBe(true);
        expect(outputs).toEqual([]);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] an interactive login that is approved [Then] polls with the verifier behind the challenge, stores the key, and clears the pending login',
    () => {
      const { layer, challenges, sessionRequests, logins, pending } = loginHandlerTest({
        interactive: true,
      });
      return Effect.gen(function* () {
        yield* handleBrowserLogin(params({ yes: true }));

        expect(sessionRequests).toHaveLength(1);
        expect(challenges).toEqual([yield* s256(sessionRequests[0].verifier)]);
        expect(sessionRequests[0].id).toBe('session-new');
        expect(logins.map(login => login.apiKey)).toEqual(['uak_linked']);
        expect(Option.isNone(pending.current())).toBe(true);
        const lines = (yield* MockConsole.getLines()).join('\n');
        expect(lines).toContain('Confirmation code: 001122');
        expect(lines).not.toContain(sessionRequests[0].verifier);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] another terminal caches its own login while an interactive login waits [Then] completes this login and keeps the other one cached',
    () => {
      const { layer, logins, pending } = loginHandlerTest({ interactive: true });
      return Effect.gen(function* () {
        yield* whileAnotherTerminalCaches(handleBrowserLogin(params({ yes: true })));

        expect(logins.map(login => login.apiKey)).toEqual(['uak_linked']);
        expect(pending.current()).toEqual(Option.some(OTHER_LOGIN));
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] an interactive login that is approved and an org picked [Then] shows one account line, naming the account from session info',
    () => {
      const { layer } = loginHandlerTest({ interactive: true });
      return Effect.gen(function* () {
        yield* handleBrowserLogin(params());

        const accountLines = (yield* MockConsole.getLines({ stripAnsi: true })).filter(line =>
          line.includes('Logged in')
        );
        expect(accountLines).toEqual(['Logged in as cli@example.com in "First Org"']);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    '[Given] an interactive login another account approved [Then] stops with the link-conflict message and clears the pending login',
    () => {
      const { layer, logins, pending } = loginHandlerTest({
        interactive: true,
        session: Effect.fail(
          sessionFailure(409, {
            slug: 'CLI_SessionLinkConflict',
            code: 2107,
            message: 'Session linked by another account',
          })
        ),
      });
      return Effect.gen(function* () {
        const error = yield* whilePolling(Effect.flip(handleBrowserLogin(params({ yes: true }))));

        expect(error).toMatchObject({
          _tag: 'commands/LoginSessionEndedError',
          reason: 'link-conflict',
          message: LOGIN_LINK_CONFLICT_MESSAGE,
        });
        expect(Option.isNone(pending.current())).toBe(true);
        expect(logins).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );
});
