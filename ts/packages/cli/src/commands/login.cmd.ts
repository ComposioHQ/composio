import { Command, Prompt } from '@effect/cli';
import { Effect, Console } from 'effect';
import { ComposioSessionRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';

/**
 * CLI command to login using Composio's CLI session APIs.
 *
 * @example
 * ```bash
 * composio login <command>
 * ```
 */
export const loginCmd = Command.make('login', {}, () =>
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
    yield* Console.log(`> Redirecting you to the login page`);

    const url = `https://app.composio.dev?cliKey=${session.code}`;
    yield* Console.log(url);

    const authenticationCode = yield* Prompt.text({
      message: '> Please enter the authentication code:',
    });
    yield* Effect.logDebug(`Authentication code: ${authenticationCode}`);

    /**
     * TODO: we're waiting for the web UI to support logging in using v3 of the backend API.
     */

    // const linkedSession = yield* client.linkSession({
    //   ...session,
    //   id: authenticationCode,
    // });

    // yield* Effect.logDebug(`Linked session: ${JSON.stringify(linkedSession)}`);

    // yield* Console.log(
    //   `Linked session code ${session.code} to user account ${linkedSession.account.email}`
    // );
  })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
