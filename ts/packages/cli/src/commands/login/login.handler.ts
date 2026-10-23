import { Array as Arr, Data, DateTime, Effect, Match, Option, pipe } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { APP_VERSION } from 'src/constants';
import {
  browserLogin,
  emitLoginComplete,
  loginEmail,
  LoginSessionError,
  mapSessionEnding,
  playgroundTestUserId,
  reportLoginAccount,
  settlingPendingLogin,
  storeCredentials,
  waitForLinkedSession,
} from 'src/effects/browser-login';
import type { RetrievedSession } from 'src/models/session';
import { completeAgentLogin } from 'src/effects/complete-agent-login';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import { inferSkillReleaseChannel, installSkillSafe } from 'src/effects/install-skill';
import { linkAnalyticsIdentityForOrg } from 'src/effects/link-analytics-identity';
import {
  ensureAgentSignupAllowed,
  getOrSignupReadyAgent,
  getStoredReadyAgent,
  isAgentIdentityForApiKey,
  type AgentIdentity,
} from 'src/services/agents';
import {
  getSessionInfoByUserApiKey,
  listOrganizations,
  type OrganizationSummary,
} from 'src/services/composio-account';
import { ComposioSessionRepository } from 'src/services/composio-clients';
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';
import {
  PendingLoginError,
  PendingLoginSession,
  type PendingLogin,
} from 'src/services/pending-login-session';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { InvalidOrganizationError, LoginSessionRequestError } from './login.errors';
import {
  AGENT_WITH_OTHER_FLAGS_MESSAGE,
  ALREADY_LOGGED_IN_MESSAGE,
  ALREADY_LOGGED_IN_OUTRO,
  INVALID_ORGANIZATION_MESSAGE,
  KEY_AND_USER_API_KEY_MESSAGE,
  KEY_NOT_PENDING_MESSAGE,
  ORG_WITHOUT_USER_API_KEY_MESSAGE,
  OUTDATED_PENDING_LOGIN_MESSAGE,
  POLL_WITH_OTHER_FLAGS_MESSAGE,
  REAUTHENTICATING_MESSAGE,
  SESSION_NOT_LINKED_HINT,
  SESSION_NOT_LINKED_MESSAGE,
  USER_API_KEY_WITH_SESSION_FLAGS_MESSAGE,
  formatPollLoginComplete,
  formatPollLoginJson,
  organizationNotFoundMessage,
  type PollLoginSummary,
} from './login.format';

/** The flags of `composio login`. */
export type LoginParams = {
  readonly noBrowser: boolean;
  readonly poll: boolean;
  readonly noWait: boolean;
  readonly key: Option.Option<string>;
  readonly userApiKey: Option.Option<string>;
  readonly org: Option.Option<string>;
  readonly yes: boolean;
  readonly noSkillInstall: boolean;
  readonly agent: boolean;
};

/** The five ways `login` can complete; the flags pick one. */
type LoginFlow = Data.TaggedEnum<{
  Poll: Record<never, never>;
  Agent: Record<never, never>;
  SessionKey: { readonly key: string };
  Direct: { readonly userApiKey: string };
  Browser: Record<never, never>;
}>;
const LoginFlow = Data.taggedEnum<LoginFlow>();

const invalidOptionValue = commandInputError('login');

// --- shared steps -----------------------------------------------------------------------------

/** Installs the composio-cli skill after a login, unless skipped or nobody can answer a prompt. */
const offerSkillInstall = (skip: boolean) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { canPrompt } = yield* ui.capabilities;
    yield* Effect.when(
      installSkillSafe({ channel: inferSkillReleaseChannel(APP_VERSION) }),
      Effect.succeed(canPrompt && !skip)
    );
  });

/** The session, or a failure after telling the user to finish the browser step first. */
const requireLinkedNow = (session: RetrievedSession) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    if (session.status === 'linked') {
      return session;
    }
    yield* ui.log.error(SESSION_NOT_LINKED_MESSAGE);
    yield* ui.log.info(SESSION_NOT_LINKED_HINT);
    return yield* new LoginSessionError({
      message: 'Session not yet linked',
      status: session.status,
    });
  });

type ProvableLogin = {
  readonly key: string;
  readonly verifier: string;
  readonly expiresAt: DateTime.Utc;
};

const provableLogin = (pending: PendingLogin) =>
  Effect.gen(function* () {
    if (pending.verifier === undefined) {
      return yield* new PendingLoginError({
        message: OUTDATED_PENDING_LOGIN_MESSAGE,
        reason: 'outdated',
      });
    }
    const expiresAt = yield* Option.match(DateTime.make(pending.expiresAt), {
      onNone: () =>
        Effect.fail(
          new PendingLoginError({ message: 'Pending login cache is invalid', reason: 'invalid' })
        ),
      onSome: Effect.succeed,
    });
    return { key: pending.key, verifier: pending.verifier, expiresAt } satisfies ProvableLogin;
  });

/**
 * Completes the cached CLI session: checks it once (`noWait`) or waits until it is linked,
 * then stores its user API key. The cache is cleared once the key arrives or the API ends the
 * login. With `defaultToFirstOrg`, the first of the account's organizations becomes the current
 * org. Reports the login only when `announce`.
 */
const loginWithKey = (
  params: ProvableLogin & {
    readonly noWait: boolean;
    readonly announce: boolean;
    readonly defaultToFirstOrg?: boolean;
  }
) =>
  Effect.gen(function* () {
    const client = yield* ComposioSessionRepository;
    const getSession = client
      .getSession({ id: params.key, verifier: params.verifier })
      .pipe(
        mapSessionEnding(
          cause =>
            new LoginSessionRequestError({ message: 'Failed to load the login session.', cause })
        )
      );
    const linkedSession = yield* settlingPendingLogin(
      params.noWait
        ? Effect.flatMap(getSession, requireLinkedNow)
        : waitForLinkedSession(getSession, params.expiresAt)
    );

    const uakApiKey = linkedSession.api_key;
    const sessionInfo = yield* getSessionInfoByUserApiKey({ userApiKey: uakApiKey });
    const organizations: ReadonlyArray<OrganizationSummary> = params.defaultToFirstOrg
      ? yield* listOrganizations({ apiKey: uakApiKey }).pipe(
          Effect.map(response => response.data),
          Effect.catch(error =>
            Effect.logDebug('Failed to list organizations after login:', error).pipe(Effect.as([]))
          )
        )
      : [];
    const defaultOrg = Arr.head(organizations);
    const orgId = Option.match(defaultOrg, {
      onNone: () => sessionInfo.project.org.id,
      onSome: org => org.id,
    });
    const orgName = Option.match(defaultOrg, {
      onNone: () => sessionInfo.project.org.name,
      onSome: org => org.name,
    });

    yield* storeCredentials({
      uakApiKey,
      initialOrgId: orgId,
      initialProjectId: sessionInfo.project.nano_id,
      fallbackEmail: linkedSession.account.email,
      announce: false,
      linkAnalytics: true,
    });

    const email = loginEmail(sessionInfo, linkedSession);
    if (params.announce) {
      yield* emitLoginComplete({ email, orgId, orgName });
    }
    return { email, orgId, orgName, organizations };
  });

/** The organization `--org` names, by ID or name, among those the key can see. */
const findOrganization = (apiKey: string, requestedOrg: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const organizations = yield* listOrganizations({ apiKey });
    const match = Arr.findFirst(
      organizations.data,
      org => org.id === requestedOrg || org.name === requestedOrg
    );
    return yield* Option.match(match, {
      onSome: Effect.succeed,
      onNone: () =>
        ui.log.error(organizationNotFoundMessage(requestedOrg)).pipe(
          Effect.andThen(
            Effect.fail(
              new InvalidOrganizationError({
                message: INVALID_ORGANIZATION_MESSAGE,
                requestedOrg,
              })
            )
          )
        ),
    });
  });

/**
 * A stored READY agent identity a headless login may reuse: only when nobody can answer a
 * prompt, no explicit browser flow was asked for, and the identity is the active login if
 * there is one.
 */
const reusableStoredAgent = (requestedExplicitLoginFlow: boolean) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const { canPrompt } = yield* ui.capabilities;
    if (canPrompt || requestedExplicitLoginFlow) {
      return Option.none<AgentIdentity>();
    }
    const stored = yield* getStoredReadyAgent;
    const activeApiKey = ctx.data.apiKey;
    return Option.filter(
      stored,
      identity =>
        Option.isNone(activeApiKey) ||
        Option.exists(activeApiKey, apiKey => isAgentIdentityForApiKey(identity, apiKey))
    );
  });

// --- flows ------------------------------------------------------------------------------------

/** `login --poll`: completes the browser login a headless `login` cached. */
export const handlePollLogin = (params: Pick<LoginParams, 'noSkillInstall'>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const pendingLoginSession = yield* PendingLoginSession;
    const login = yield* Effect.flatMap(pendingLoginSession.read, provableLogin);
    const result = yield* loginWithKey({
      ...login,
      noWait: false,
      announce: false,
      defaultToFirstOrg: true,
    });

    const summary: PollLoginSummary = {
      email: result.email,
      defaultOrgId: result.orgId,
      defaultOrgName: result.orgName,
      organizations: result.organizations,
    };
    const { canDecorate } = yield* ui.capabilities;
    if (canDecorate) {
      yield* ui.note(formatPollLoginComplete(summary), 'Login complete');
    }
    yield* reportLoginAccount(result);
    yield* ui.output(formatPollLoginJson(summary), { force: true });
    yield* offerSkillInstall(params.noSkillInstall);
  });

/** `login --agent`: logs in with the stored agent identity, signing one up when there is none. */
const handleAgentLogin = (params: Pick<LoginParams, 'noSkillInstall'>) =>
  handleAgentAuthError(
    Effect.gen(function* () {
      yield* ensureAgentSignupAllowed;
      const identity = yield* getOrSignupReadyAgent();
      yield* completeAgentLogin(identity);
      yield* offerSkillInstall(params.noSkillInstall);
    })
  );

/**
 * `login --key`: completes the CLI session a `login --no-wait` printed, only when it is the one
 * this machine cached, since only that one comes with its verifier. Any other key fails before
 * a request is sent.
 */
export const handleSessionKeyLogin = (
  params: Pick<LoginParams, 'noWait' | 'noSkillInstall'> & { readonly key: string }
) =>
  Effect.gen(function* () {
    const pendingLoginSession = yield* PendingLoginSession;
    const keyNotPending = invalidOptionValue(KEY_NOT_PENDING_MESSAGE, '--key');
    const pending = yield* pendingLoginSession.read.pipe(
      // An expired cache is already deleted, so `--poll` cannot complete it either; its own
      // error tells the user to start a new login.
      Effect.catchIf(
        error => error instanceof PendingLoginError && error.reason === 'missing',
        () => Effect.fail(keyNotPending)
      )
    );
    if (pending.key !== params.key) {
      return yield* keyNotPending;
    }
    const login = yield* provableLogin(pending);
    yield* loginWithKey({ ...login, noWait: params.noWait, announce: true });
    yield* offerSkillInstall(params.noSkillInstall);
  });

/** `login --user-api-key [--org]`: stores a user API key without a browser. */
export const handleDirectLogin = (
  params: Pick<LoginParams, 'org' | 'noSkillInstall'> & { readonly userApiKey: string }
) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const { userApiKey } = params;
    const sessionInfo = yield* getSessionInfoByUserApiKey({ userApiKey });
    const homeOrg = sessionInfo.project.org;

    const selectedOrg = yield* Option.match(
      Option.filter(params.org, requestedOrg => requestedOrg.length > 0),
      {
        onNone: () => Effect.succeed({ id: homeOrg.id, name: homeOrg.name ?? homeOrg.id }),
        onSome: requestedOrg => findOrganization(userApiKey, requestedOrg),
      }
    );

    yield* ctx.login(
      userApiKey,
      selectedOrg.id,
      playgroundTestUserId(Option.some(sessionInfo), ctx.data.testUserId)
    );
    yield* linkAnalyticsIdentityForOrg({
      apiKey: userApiKey,
      orgId: selectedOrg.id,
      knownIdentity: { orgId: homeOrg.id, orgMemberId: sessionInfo.org_member.id },
    });
    yield* primeConsumerConnectedToolkitsCacheInBackground({ orgId: selectedOrg.id });
    yield* emitLoginComplete({
      email: sessionInfo.org_member.email || undefined,
      orgId: selectedOrg.id,
      orgName: selectedOrg.name,
    });
    yield* offerSkillInstall(params.noSkillInstall);
  });

/**
 * `login` with no direct-login flag: the browser login, unless the user is already logged in
 * with an org. A headless run reuses a stored READY agent identity instead, but never signs
 * one up for a human in a pipe; `--no-browser` and `--no-wait` opt out of that reuse, since
 * both promise output (the printed URL, the session JSON) that it would replace.
 */
export const handleBrowserLogin = (
  params: Pick<LoginParams, 'noBrowser' | 'noWait' | 'yes' | 'noSkillInstall'>
) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;

    if (ctx.isLoggedIn()) {
      if (Option.isSome(ctx.data.orgId)) {
        yield* ui.log.warn(ALREADY_LOGGED_IN_MESSAGE);
        yield* ui.outro(ALREADY_LOGGED_IN_OUTRO);
        return;
      }
      yield* ui.log.step(REAUTHENTICATING_MESSAGE);
    }

    const storedAgent = yield* reusableStoredAgent(params.noBrowser || params.noWait);
    yield* Option.match(storedAgent, {
      onSome: identity => handleAgentAuthError(completeAgentLogin(identity)),
      onNone: () =>
        browserLogin({
          scope: 'user',
          noBrowser: params.noBrowser,
          noWait: params.noWait,
          skipOrgProjectPicker: params.yes,
        }).pipe(Effect.andThen(offerSkillInstall(params.noSkillInstall || params.noWait))),
    });
  });

// --- dispatch ---------------------------------------------------------------------------------

/**
 * Validates the flag combination and picks the flow. The checks run in a fixed order, so a
 * command line with several mistakes reports the first one.
 */
const selectLoginFlow = (params: LoginParams) => {
  const flags = {
    key: Option.isSome(params.key),
    userApiKey: Option.isSome(params.userApiKey),
    org: Option.isSome(params.org),
    browserOrSession: params.noBrowser || params.noWait,
    poll: params.poll,
    agent: params.agent,
  };
  type Flags = typeof flags;
  const reject = (message: string, option?: string) =>
    Effect.fail(invalidOptionValue(message, option));
  return Match.value(flags).pipe(
    Match.when({ key: true, userApiKey: true }, () => reject(KEY_AND_USER_API_KEY_MESSAGE)),
    Match.when(
      (f: Flags) => f.poll && (f.browserOrSession || f.key || f.userApiKey || f.agent),
      () => reject(POLL_WITH_OTHER_FLAGS_MESSAGE, '--poll')
    ),
    Match.when(
      (f: Flags) => f.agent && (f.browserOrSession || f.key || f.userApiKey),
      () => reject(AGENT_WITH_OTHER_FLAGS_MESSAGE, '--agent')
    ),
    Match.when({ org: true, userApiKey: false }, () =>
      reject(ORG_WITHOUT_USER_API_KEY_MESSAGE, '--org')
    ),
    Match.when({ userApiKey: true, browserOrSession: true }, () =>
      reject(USER_API_KEY_WITH_SESSION_FLAGS_MESSAGE, '--user-api-key')
    ),
    Match.when({ poll: true }, () => Effect.succeed(LoginFlow.Poll())),
    Match.when({ agent: true }, () => Effect.succeed(LoginFlow.Agent())),
    Match.orElse(() =>
      Effect.succeed(
        pipe(
          Option.map(params.key, key => LoginFlow.SessionKey({ key })),
          Option.orElse(() =>
            Option.map(params.userApiKey, userApiKey => LoginFlow.Direct({ userApiKey }))
          ),
          Option.getOrElse(() => LoginFlow.Browser())
        )
      )
    )
  );
};

/** `composio login`: validates the flag combination, then runs the flow it selects. */
export const runLogin = (params: LoginParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { canDecorate } = yield* ui.capabilities;
    yield* Effect.when(ui.intro('composio login'), Effect.succeed(canDecorate));

    const flow = yield* selectLoginFlow(params);
    yield* Match.valueTags(flow, {
      Poll: () => handlePollLogin(params),
      Agent: () => handleAgentLogin(params),
      SessionKey: ({ key }) => handleSessionKeyLogin({ ...params, key }),
      Direct: ({ userApiKey }) => handleDirectLogin({ ...params, userApiKey }),
      Browser: () => handleBrowserLogin(params),
    });
  });
