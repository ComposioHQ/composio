import { Command, Options, Prompt } from '@effect/cli';
import { Effect, Console } from 'effect';
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

    // TODO: refactor into a PUT request
    // const url = `https://platform.composio.dev?cliKey=${session.id}`;

    // if (noBrowser) {
    //   yield* Console.log(`> Please login using the following URL:`);
    // } else {
    //   yield* Console.log(`> Redirecting you to the login page`);
    // }

    // yield* Console.log(green`> ${url}`);

    // if (!noBrowser) {
    //   // Open the given `url` in the default browser
    //   yield* Effect.tryPromise(() =>
    //     open(url, {
    //       app: {
    //         name: apps.browser,
    //       },
    //       wait: false,
    //     })
    //   );
    // }

    // const authenticationCode = yield* Prompt.text({
    //   message: '> Please enter the authentication code:',
    // });
    // yield* Effect.logDebug(`Authentication code: ${authenticationCode}`);

    const authenticationCode = session.id;

    const linkedSession = yield* client.linkSession({
      ...session,
      id: authenticationCode,
    });

    yield* Effect.logDebug(`Linked session: ${JSON.stringify(linkedSession)}`);

    // yield* Console.log(
    //   `Linked session code ${session.code} to user account ${linkedSession.account.email}`
    // );
  })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
