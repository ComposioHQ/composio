import { Command } from '@effect/cli';
import { Effect, Console } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';

/**
 * CLI command to log out from the Composio CLI.
 *
 * @example
 * ```bash
 * composio logout <command>
 * ```
 */
export const logoutCmd = Command.make('logout', {}, () =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;

    if (!ctx.isLoggedIn()) {
      yield* Console.log('You are not logged in yet. Please run `composio login`.');
      return;
    }

    yield* ctx.logout;
    yield* Console.log(`Logged out successfully.`);
  })
).pipe(Command.withDescription('Log out from the Composio SDK.'));
