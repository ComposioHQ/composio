/**
 * The identity gate every login that adopts a linked CLI session passes before its credential
 * is stored (PRDE-1702): a linked CLI session is completed by whoever presents its id, so the
 * CLI pins or confirms the account the operator expected before trusting the key it carries.
 *
 * Three modes, in order:
 * 1. `expectedEmail` set — the login is pinned: a different linked (or direct-login) account
 *    fails without storing anything, and a match skips the prompt so unattended flows stay
 *    unattended.
 * 2. Interactive — the linked account's email and the session's verification code are shown
 *    and the operator must confirm; declining (or an empty linked email) fails closed.
 * 3. Headless without a pin — completes with a warning naming the linked account, so the
 *    documented `--poll` agent flow keeps working while making the missing binding visible.
 */
import { Data, Effect } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { TerminalUI } from 'src/services/terminal-ui';

export class LoginIdentityError extends Data.TaggedError('commands/LoginIdentityError')<{
  readonly message: string;
  readonly reason: 'mismatch' | 'declined' | 'unidentified';
  readonly linkedEmail?: string;
  readonly expectedEmail?: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

/** Comparison of a pinned expectation against a linked account is exact modulo case and trim. */
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const emailMatchesExpectation = (expected: string, linked: string) =>
  normalizeEmail(expected).length > 0 && normalizeEmail(expected) === normalizeEmail(linked);

/**
 * The confirmation question and the verification-code note an interactive run sees. The code
 * is the session's own pairing artifact: the approval page must show the same code before the
 * account is linked, so a relayed URL alone is not enough to bind a stranger's account.
 */
const formatIdentityConfirmation = (params: {
  readonly email: string;
  readonly verificationCode?: string;
}) =>
  `Account: ${params.email}` +
  (params.verificationCode
    ? `\nVerification code: ${params.verificationCode}\nThe approval page must show this code. Do not approve if it does not match.`
    : '');

/**
 * Fails with `mismatch` when the account does not match the pinned email, skips the prompt
 * when it does, otherwise asks an interactive operator to confirm and lets a headless run
 * through with a warning. Never stores anything itself — callers gate their store step.
 */
export const confirmLoginIdentity = (params: {
  /** The email of the account the login would adopt. */
  readonly email: string;
  /** The session's pairing code, shown next to the account on an interactive confirmation. */
  readonly verificationCode?: string;
  /** The pinned expectation (`--expect-email`), when the operator provided one. */
  readonly expectedEmail?: string | undefined;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    if (params.expectedEmail !== undefined) {
      if (!emailMatchesExpectation(params.expectedEmail, params.email)) {
        return yield* new LoginIdentityError({
          message: `The login is bound to '${params.expectedEmail}', but it was completed as '${params.email}'. No credentials were stored.`,
          reason: 'mismatch',
          linkedEmail: params.email,
          expectedEmail: params.expectedEmail,
        });
      }
      yield* Effect.logDebug(`Login identity verified against the pinned email: ${params.email}`);
      return;
    }

    const { canPrompt, canDecorate } = yield* ui.capabilities;
    if (canPrompt) {
      if (canDecorate) {
        yield* ui.note(formatIdentityConfirmation(params), 'Confirm this login');
      }
      // Fail-closed default: doing nothing answers "no".
      const confirmed = yield* ui.confirm(`Sign in as ${params.email}?`, {
        defaultValue: false,
      });
      if (!confirmed || params.email.trim().length === 0) {
        yield* ui.log.error('Login aborted. No credentials were stored.');
        return yield* new LoginIdentityError({
          message: 'Login aborted: the linked account was not confirmed.',
          reason: 'declined',
          linkedEmail: params.email,
        });
      }
      return;
    }

    yield* ui.log.warn(
      `Completing login as '${params.email}' without identity verification. Start or complete the login with '--expect-email <email>' to require a specific account.`
    );
  });
