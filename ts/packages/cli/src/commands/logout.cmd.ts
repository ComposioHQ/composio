import { Command } from '@effect/cli';
import { Effect } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';

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
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;

    if (!ctx.isLoggedIn()) {
      yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
      return;
    }

    yield* ctx.logout;

    yield* ui.log.success('Logged out successfully.');
  })
).pipe(Command.withDescription('Log out from the Composio SDK.'));
