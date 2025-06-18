import { Command } from '@effect/cli';
import { Effect, Console } from 'effect';
import { ComposioSessionRepository } from 'src/services/composio-clients';

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
    const client = yield* ComposioSessionRepository;
    const session = yield* client.createSession();
    const linkedSession = yield* client.linkSession(session);

    yield* Effect.logDebug(`Linked session: ${JSON.stringify(linkedSession)}`);

    yield* Console.log(
      `Linked session code ${session.code} to user account ${linkedSession.account.email}`
    );
  })
).pipe(Command.withDescription('Log in to the Composio SDK.'));
