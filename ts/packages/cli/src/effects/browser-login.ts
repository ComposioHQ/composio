/**
 * The browser login through a CLI session, shared by `composio login` (user scope) and
 * `composio dev init` (project scope): create the session bound to a verifier only this
 * terminal holds, show or open its URL, wait for it to be linked, then store the user API key
 * it carries.
 */
import { isAPIError } from '@composio/client/effect';
import { Data, DateTime, Effect, Option, Schedule, pipe } from 'effect';
import { CODE_CHALLENGE_METHOD, makeCliSessionProof } from 'src/effects/cli-session-proof';
import { ExpectedFailure } from 'src/effects/expected-failure';
import open from 'open';
import type { RetrievedSession } from 'src/models/session';
import { ComposioSessionRepository } from 'src/services/composio-clients';
import {
  getSessionInfo,
  getSessionInfoByUserApiKey,
  sessionUserIdOf,
  type SessionInfoResponse,
} from 'src/services/composio-account';
import { commandHintStep } from 'src/services/command-hints';
import { primeConsumerConnectedToolkitsCacheInBackground } from 'src/services/consumer-short-term-cache';
import { PendingLoginSession } from 'src/services/pending-login-session';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { linkAnalyticsIdentityForOrg } from './link-analytics-identity';
import { runOrgSelection } from './select-org-project';

/** The session exists but is not linked yet. */
export class LoginSessionError extends Data.TaggedError('commands/LoginSessionError')<{
  readonly message: string;
  readonly status: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

/** Why the API, or the session's expiry, ended a login for good. */
export type LoginSessionEndReason =
  | 'proof-rejected'
  | 'not-found'
  | 'already-issued'
  | 'link-conflict'
  | 'upgrade-required'
  | 'expired';

/** The login cannot complete any more; waiting longer would not change the answer. */
export class LoginSessionEndedError extends Data.TaggedError('commands/LoginSessionEndedError')<{
  readonly message: string;
  readonly reason: LoginSessionEndReason;
  readonly cause?: unknown;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

/**
 * `create-session` did not acknowledge the session's proof, so the session could be completed
 * by anyone holding its id. The CLI refuses to use it.
 */
export class LoginProofNotAcknowledgedError extends Data.TaggedError(
  'commands/LoginProofNotAcknowledgedError'
)<{
  readonly message: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

class LoginBrowserOpenError extends Data.TaggedError('commands/LoginBrowserOpenError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export type LinkedSession = Extract<RetrievedSession, { readonly status: 'linked' }>;

/** Seconds between two checks of a session that is not linked yet. */
const LOGIN_POLL_INTERVAL_SECONDS = 5;

const POLL_COMMAND = 'composio login --poll';

/** The 409 slug of a session another account approved after the first one did. */
const LINK_CONFLICT_SLUG = 'CLI_SessionLinkConflict';

export const LOGIN_PROOF_NOT_ACKNOWLEDGED_MESSAGE =
  'The Composio API did not confirm that this login is bound to this terminal, so the CLI stopped it. Log in with `composio login --user-api-key <key>` instead.';
export const LOGIN_PROOF_REJECTED_MESSAGE =
  "The Composio API rejected this terminal's proof for the login, so the login was stopped. Run `composio login` again.";
export const LOGIN_SESSION_NOT_FOUND_MESSAGE =
  'Login session not found or expired. Run `composio login` again.';
export const LOGIN_ALREADY_ISSUED_MESSAGE =
  'This login already received its key. Run `composio login` again.';
export const LOGIN_LINK_CONFLICT_MESSAGE =
  'Another account approved this login, so it was cancelled. Run `composio login` again.';
export const LOGIN_UPGRADE_REQUIRED_MESSAGE =
  'This version of the Composio CLI can no longer log in through the browser. Run `composio upgrade`, or log in with `composio login --user-api-key <key>`.';
export const LOGIN_EXPIRED_MESSAGE =
  'The login expired before it was approved. Run `composio login` again.';

// --- presentation -----------------------------------------------------------------------------

const formatConfirmationCode = (code: string) => `Confirmation code: ${code}`;

const formatNonInteractiveLoginInstructions = (params: {
  readonly loginUrl: string;
  readonly confirmationCode: string;
  readonly pollCommand: string;
}) => `Open this URL in your browser to log in:

  ${params.loginUrl}

${formatConfirmationCode(params.confirmationCode)}

Then run this command to complete login:

  ${params.pollCommand}

hint: For agents: Show the URL above to the user to click, then run the command above. The command uses the cached login key, polls for up to 10 minutes, and exits once credentials are saved. Do not ask the user whether to poll — they already requested login.

hint: For unattended agents: If no human is available to open the URL, run \`composio login --agent\` instead — it signs the CLI in with a Composio agent account (creating one if needed) without a browser. Never use it when a human is present to log in with their own account.`;

const formatLoginSuccessMessage = (params: {
  readonly email?: string;
  readonly orgName?: string;
}): string =>
  `Logged in ${params.email ? `as ${params.email}` : 'successfully'}${params.orgName ? ` in "${params.orgName}"` : ''}`;

/** The stdout payload of a completed login. */
const formatLoginCompleteJson = (params: {
  readonly email?: string;
  readonly orgId: string;
  readonly orgName?: string;
}) =>
  JSON.stringify({
    email: params.email,
    org_id: params.orgId,
    org_name: params.orgName ?? '',
  });

/** `Logged in as <email> (<org>)`, the org by name when it has one. */
const formatLoginAccountLine = (params: {
  readonly email?: string;
  readonly orgId: string;
  readonly orgName?: string;
}): string =>
  `Logged in ${params.email ? `as ${params.email}` : 'successfully'} (${params.orgName || params.orgId})`;

/**
 * Names the account a login stored on stderr when stderr is not a terminal, where the
 * decorated success line does not render, so a log or an agent relaying the login still
 * sees whose key the CLI now holds.
 */
export const reportLoginAccount = (params: {
  readonly email?: string;
  readonly orgId: string;
  readonly orgName?: string;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { stderrIsTTY } = yield* ui.capabilities;
    if (!stderrIsTTY) {
      yield* ui.error(formatLoginAccountLine(params));
    }
  });

/** Reports a completed login: the success line and next-step hints on stderr, the JSON on stdout. */
export const emitLoginComplete = (params: {
  readonly email?: string;
  readonly orgId: string;
  readonly orgName?: string;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* ui.log.success(formatLoginSuccessMessage(params));
    yield* reportLoginAccount(params);
    yield* ui.log.info(commandHintStep('Execute a tool directly', 'root.execute'));
    yield* ui.log.info(commandHintStep('Switch your current org', 'root.orgs.switch'));
    yield* ui.output(formatLoginCompleteJson(params));
    yield* ui.outro("You're all set!");
  });

// --- shared steps -----------------------------------------------------------------------------

/**
 * The playground test user of the session's member, or `fallback` when there is no session
 * info or it carries no user id.
 */
export const playgroundTestUserId = (
  sessionInfo: Option.Option<SessionInfoResponse>,
  fallback: Option.Option<string>
) =>
  pipe(
    sessionInfo,
    Option.map(sessionUserIdOf),
    Option.filter(userId => userId.length > 0),
    Option.map(userId => `pg-test-${userId}`),
    Option.orElse(() => fallback),
    Option.getOrUndefined
  );

/** The session, or a failure naming its status while it is not linked yet. */
const requireLinkedSession = (session: RetrievedSession) =>
  session.status === 'linked'
    ? Effect.succeed(session)
    : Effect.fail(
        new LoginSessionError({
          message: `Session status is still '${session.status}', waiting for 'linked'`,
          status: session.status,
        })
      );

const ended = (reason: LoginSessionEndReason, message: string, cause: unknown) =>
  Option.some(new LoginSessionEndedError({ reason, message, cause }));

/**
 * The end a failed `get-session` call puts to the login, when the API's answer is final: a
 * rejected proof (401), a session that is gone (404), a key already issued or a login another
 * account cancelled (409), or a CLI too old to log in (410, whose text comes from the API).
 * Any other failure may pass, so it is none.
 */
export const sessionEnding = (error: unknown): Option.Option<LoginSessionEndedError> => {
  if (!isAPIError(error)) return Option.none();
  switch (error.status) {
    case 401:
      return ended('proof-rejected', LOGIN_PROOF_REJECTED_MESSAGE, error);
    case 404:
      return ended('not-found', LOGIN_SESSION_NOT_FOUND_MESSAGE, error);
    case 409:
      return error.details?.slug === LINK_CONFLICT_SLUG
        ? ended('link-conflict', LOGIN_LINK_CONFLICT_MESSAGE, error)
        : ended('already-issued', LOGIN_ALREADY_ISSUED_MESSAGE, error);
    case 410:
      return ended(
        'upgrade-required',
        error.details?.message || LOGIN_UPGRADE_REQUIRED_MESSAGE,
        error
      );
    default:
      return Option.none();
  }
};

/**
 * Checks the session behind a spinner until it is linked, every `LOGIN_POLL_INTERVAL_SECONDS`
 * until `expiresAt`. A `LoginSessionEndedError` stops the wait at once; when the session
 * expires first, the wait ends as `expired`.
 */
export const waitForLinkedSession = <E, R>(
  getSession: Effect.Effect<RetrievedSession, E, R>,
  expiresAt: DateTime.Utc
) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const beforeExpiry = Effect.map(DateTime.now, now => DateTime.isLessThan(now, expiresAt));
    return yield* ui.useMakeSpinner('Waiting for login...', spinner =>
      Effect.flatMap(getSession, requireLinkedSession).pipe(
        Effect.retry({
          schedule: Schedule.spaced(`${LOGIN_POLL_INTERVAL_SECONDS} seconds`),
          while: error =>
            error instanceof LoginSessionEndedError ? Effect.succeed(false) : beforeExpiry,
        }),
        Effect.mapError(error =>
          error instanceof LoginSessionEndedError
            ? error
            : new LoginSessionEndedError({
                reason: 'expired',
                message: LOGIN_EXPIRED_MESSAGE,
                cause: error,
              })
        ),
        Effect.tap(() => spinner.stop('Login successful')),
        Effect.tapError(error =>
          spinner.error(error.reason === 'expired' ? 'Login timed out.' : 'Login stopped.')
        )
      )
    );
  });

/**
 * Clears the cached login once `self` settles it: when the session's key arrives, and when the
 * login ends for good. Any other failure keeps it for another `composio login --poll`.
 */
export const settlingPendingLogin = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const pendingLogin = yield* PendingLoginSession;
    return yield* self.pipe(
      Effect.tap(() => pendingLogin.clear),
      Effect.tapError(error =>
        error instanceof LoginSessionEndedError ? pendingLogin.clear : Effect.void
      )
    );
  });

/**
 * Verifies the linked session's key through session/info and stores it as the CLI's login.
 * The session info is enrichment only: the linked session is already authenticated, so a
 * failed lookup falls back to the IDs the caller passes.
 */
export const storeCredentials = (params: {
  readonly uakApiKey: string;
  readonly initialOrgId: string;
  readonly initialProjectId: string;
  readonly fallbackEmail: string;
  /** Report the login (stderr and stdout) once stored. */
  readonly announce: boolean;
  /** Link the analytics identity now, rather than after a later org selection. */
  readonly linkAnalytics: boolean;
}) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const sessionInfo = yield* getSessionInfo({
      apiKey: params.uakApiKey,
      orgId: params.initialOrgId,
      projectId: params.initialProjectId,
    }).pipe(
      Effect.map(Option.some),
      // Catch-all rather than per-tag: no way this enrichment can fail may stop the
      // credential from being stored.
      Effect.catch(error =>
        Effect.logDebug('Session info fetch failed:', error).pipe(
          Effect.as(Option.none<SessionInfoResponse>())
        )
      )
    );

    // session/info is the canonical source of the org ID; the linked session may carry a
    // session-level identifier instead.
    const orgId = Option.match(sessionInfo, {
      onNone: () => params.initialOrgId,
      onSome: info => info.project.org.id,
    });
    if (orgId !== params.initialOrgId) {
      yield* Effect.logDebug(
        `orgId corrected: ${params.initialOrgId} -> ${orgId} (from session/info)`
      );
    }

    yield* ctx.login(
      params.uakApiKey,
      orgId,
      playgroundTestUserId(sessionInfo, ctx.data.testUserId)
    );
    // Linked only after the credential persists, so stitching cannot outlive a failed login.
    if (params.linkAnalytics) {
      yield* linkAnalyticsIdentityForOrg({
        apiKey: params.uakApiKey,
        orgId,
        knownIdentity: Option.getOrUndefined(
          Option.map(sessionInfo, info => ({
            orgId: info.project.org.id,
            orgMemberId: info.org_member.id,
          }))
        ),
      });
    }
    yield* primeConsumerConnectedToolkitsCacheInBackground({ orgId });

    if (params.announce) {
      yield* emitLoginComplete({
        email:
          Option.getOrUndefined(Option.map(sessionInfo, info => info.org_member.email)) ||
          params.fallbackEmail ||
          undefined,
        orgId,
        orgName:
          Option.getOrUndefined(Option.map(sessionInfo, info => info.project.org.name)) ||
          undefined,
      });
    }
  });

/**
 * Lets the user pick the current org after a browser login, stores the pick, links the
 * analytics identity for it, and reports the login. A failed org list keeps the session's org.
 */
const completeOrgSelection = (params: {
  readonly uakApiKey: string;
  readonly sessionInfo: SessionInfoResponse;
  readonly linkedSession: LinkedSession;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const { uakApiKey, sessionInfo, linkedSession } = params;

    const selected = yield* runOrgSelection({ apiKey: uakApiKey }).pipe(
      Effect.map(Option.fromUndefinedOr),
      Effect.catch(error =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Org picker failed:', error);
          yield* ui.log.warn('Could not load org list. Using current org.');
          return Option.none();
        })
      )
    );
    yield* Option.match(selected, {
      onNone: () => Effect.void,
      onSome: org =>
        ctx
          .login(
            uakApiKey,
            org.id,
            playgroundTestUserId(Option.some(sessionInfo), ctx.data.testUserId)
          )
          .pipe(Effect.andThen(primeConsumerConnectedToolkitsCacheInBackground({ orgId: org.id }))),
    });

    const orgId = Option.match(selected, {
      onNone: () => sessionInfo.project.org.id,
      onSome: org => org.id,
    });
    yield* linkAnalyticsIdentityForOrg({
      apiKey: uakApiKey,
      orgId,
      knownIdentity: {
        orgId: sessionInfo.project.org.id,
        orgMemberId: sessionInfo.org_member.id,
      },
    });
    yield* emitLoginComplete({
      email: sessionInfo.org_member.email || linkedSession.account.email || undefined,
      orgId,
      orgName: Option.match(selected, {
        onNone: () => sessionInfo.project.org.name ?? '',
        onSome: org => org.name,
      }),
    });
  });

/** Opens the login URL in the default browser; a failure only prints a hint. */
const openLoginUrl = (url: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* Effect.tryPromise({
      try: () => open(url, { wait: false }),
      catch: cause => new LoginBrowserOpenError({ message: 'Failed to open the browser.', cause }),
    }).pipe(
      Effect.catchTag('commands/LoginBrowserOpenError', error =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Failed to open browser:', error);
          yield* ui.log.warn('Could not open the browser automatically.');
          yield* ui.log.info(`Tip: try using the \`--no-browser\` flag and open the URL manually.`);
        })
      )
    );
  });

/**
 * Runs the browser login: creates a CLI session and caches it for `composio login --poll`,
 * then either prints the poll instructions and returns (`noWait`, or nobody can answer a
 * prompt), or shows the URL (opening it unless `noBrowser`), waits until the session is
 * linked, and stores the credentials. A `user` login then lets the user pick the current org
 * unless `skipOrgProjectPicker`.
 */
export const browserLogin = (params: {
  /** Session scope: 'user' for login, 'project' for init. */
  readonly scope: 'user' | 'project';
  /** When true, don't open browser — just show the URL. */
  readonly noBrowser: boolean;
  /** When true, print URL/session info and exit without waiting (implies noBrowser). */
  readonly noWait?: boolean;
  /** When true (login only), skip the org picker and use the session's org. */
  readonly skipOrgProjectPicker?: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const client = yield* ComposioSessionRepository;
    const pendingLogin = yield* PendingLoginSession;

    yield* Effect.logDebug(`Authenticating (scope: ${params.scope})...`);
    const proof = yield* makeCliSessionProof;
    const session = yield* client.createSession({
      scope: params.scope,
      codeChallenge: proof.challenge,
    });
    if (session.code_challenge_method !== CODE_CHALLENGE_METHOD) {
      return yield* new LoginProofNotAcknowledgedError({
        message: LOGIN_PROOF_NOT_ACKNOWLEDGED_MESSAGE,
      });
    }
    yield* Effect.logDebug(`Created session: ${session.id}`);

    const url = `${ctx.data.webURL}?cliKey=${session.id}`;
    yield* pendingLogin.write({
      key: session.id,
      loginUrl: url,
      expiresAt: DateTime.formatIso(session.expiresAt),
      verifier: proof.verifier,
    });

    const { canPrompt, canDecorate } = yield* ui.capabilities;
    const effectiveNoWait = params.noWait || !canPrompt;
    const effectiveNoBrowser = params.noBrowser || effectiveNoWait;

    if (effectiveNoWait) {
      const loginInstructions = formatNonInteractiveLoginInstructions({
        loginUrl: url,
        confirmationCode: session.code,
        pollCommand: POLL_COMMAND,
      });
      if (canDecorate) {
        yield* ui.log.info('Please login using the following URL:');
        yield* ui.note(url, 'Login URL');
        yield* ui.note(loginInstructions, 'Login instructions');
      }
      yield* ui.output(loginInstructions);
      return;
    }

    yield* effectiveNoBrowser
      ? ui.log.info('Please login using the following URL:')
      : ui.log.step('Redirecting you to the login page');
    yield* ui.note(url, 'Login URL');
    yield* ui.log.info(formatConfirmationCode(session.code));
    yield* ui.output(url);
    if (!effectiveNoBrowser) {
      yield* openLoginUrl(url);
    }

    const linkedSession = yield* settlingPendingLogin(
      waitForLinkedSession(
        client
          .getSession({ id: session.id, verifier: proof.verifier })
          .pipe(Effect.mapError(error => Option.getOrElse(sessionEnding(error), () => error))),
        session.expiresAt
      )
    );
    yield* Effect.logDebug(`Linked session ID: ${linkedSession.id}`);

    // e.g., "uak_b813ydmoEYdB_xBxGHeW"
    const uakApiKey = linkedSession.api_key;
    const sessionInfo = yield* getSessionInfoByUserApiKey({ userApiKey: uakApiKey });
    yield* Effect.logDebug('UAK session info:', {
      xProjectId: sessionInfo.project.nano_id,
      xOrgId: sessionInfo.project.org.id,
    });

    const willRunPicker = params.scope === 'user' && !params.skipOrgProjectPicker;
    yield* storeCredentials({
      uakApiKey,
      initialOrgId: sessionInfo.project.org.id,
      initialProjectId: sessionInfo.project.nano_id,
      fallbackEmail: linkedSession.account.email,
      announce: !willRunPicker,
      linkAnalytics: !willRunPicker,
    });

    if (willRunPicker) {
      yield* completeOrgSelection({ uakApiKey, sessionInfo, linkedSession });
    }
  });
