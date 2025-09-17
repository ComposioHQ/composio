import { Command, Options } from '@effect/cli';
import { Effect, Console, Schedule } from 'effect';
import { green } from 'ansis';
import open, { apps } from 'open';
import { ComposioSessionRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';

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
    const ctx = yield* ComposioUserContext;

    if (ctx.isLoggedIn()) {
      yield* Console.log(`✔ You're already logged in!.`);
      yield* Console.log(
        `✔ If you want to log in with a different account, please run \`composio logout\` first.`
      );
      return;
    }

    const client = yield* ComposioSessionRepository;

    yield* Effect.logDebug('Authenticating...');

    const session = yield* client.createSession();

    yield* Effect.logDebug(`Created session:`, session);

    const url = `${ctx.data.webURL}?cliKey=${session.id}`;

    if (noBrowser) {
      yield* Console.log(`> Please login using the following URL:`);
    } else {
      yield* Console.log(`> Redirecting you to the login page`);
    }

    yield* Console.log(green`> ${url}`);

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

    // Retry operation until the session status is "linked" with exponential backoff
    const linkedSession = yield* Effect.retry(
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
    );

    yield* Effect.logDebug(`Linked session: ${JSON.stringify(linkedSession)}`);

    yield* ctx.login(linkedSession.api_key);

    yield* Console.log(`Logged in with user account ${linkedSession.account.email}`);
  })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
