import { Command, Options } from '@effect/cli';
import { Effect, Schedule } from 'effect';
import open, { apps } from 'open';
import { ComposioSessionRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';

export const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Login without browser interaction')
);

/**
 * CLI command to login using Composio's CLI session APIs.
 *
 * @example
 * ```bash
 * composio login <command>
 * ```
 */
export const loginCmd = Command.make('login', { noBrowser }, ({ noBrowser }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;

    yield* ui.intro('composio login');

    if (ctx.isLoggedIn()) {
      yield* ui.log.warn(`You're already logged in!`);
      yield* ui.log.info(
        `If you want to log in with a different account, please run \`composio logout\` first.`
      );
      yield* ui.outro('');
      return;
    }

    const client = yield* ComposioSessionRepository;

    yield* Effect.logDebug('Authenticating...');

    const session = yield* client.createSession();

    yield* Effect.logDebug(`Created session:`, session);

    const url = `${ctx.data.webURL}?cliKey=${session.id}`;

    if (noBrowser) {
      yield* ui.log.info('Please login using the following URL:');
    } else {
      yield* ui.log.step('Redirecting you to the login page');
    }

    yield* ui.note(url, 'Login URL');
    yield* ui.output(url);

    if (!noBrowser) {
      // Open the given `url` in the default browser
      yield* Effect.tryPromise(() =>
        open(url, {
          app: {
            name: apps.browser,
          },
          wait: false,
        })
      );
    }

    // Retry operation until the session status is "linked" with exponential backoff.
    // useMakeSpinner auto-cleans up the spinner on interruption (e.g., Ctrl+C).
    const linkedSession = yield* ui.useMakeSpinner('Waiting for login...', spinner =>
      Effect.retry(
        Effect.gen(function* () {
          const currentSession = yield* client.getSession({
            ...session,
          });

          // Check if session is linked
          if (currentSession.status === 'linked') {
            return currentSession;
          }

          // If still pending, fail to trigger retry
          return yield* Effect.fail(
            new Error(`Session status is still '${currentSession.status}', waiting for 'linked'`)
          );
        }),
        // Exponential backoff: start with 0.3s, max 5s, up to 15 retries
        Schedule.exponential('0.3 seconds').pipe(
          Schedule.intersect(Schedule.recurs(15)),
          Schedule.intersect(Schedule.spaced('5 seconds'))
        )
      ).pipe(
        Effect.tap(() => spinner.stop('Login successful')),
        Effect.tapError(() => spinner.error('Login timed out. Please try again.'))
      )
    );

    yield* Effect.logDebug(`Linked session: ${JSON.stringify(linkedSession)}`);

    yield* ctx.login(linkedSession.api_key);

    yield* ui.log.success(`Logged in with user account ${linkedSession.account.email}`);
    yield* ui.outro("You're all set!");
  })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
