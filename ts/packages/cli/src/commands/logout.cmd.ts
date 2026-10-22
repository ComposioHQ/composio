import { Command, Flag } from 'effect/cli';
import { Effect, Option } from 'effect';
import {
  AGENT_CONFIG_FILE_NAME,
  getCurrentLoggedInAgent,
  removeStoredAgentIdentity,
} from 'src/services/agents';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { clearApolloIdentityForAnalytics } from 'src/analytics/dispatch';
import { commandInputError } from 'src/commands/errors';

// `--force` and `-f` predate `--yes` and keep working.
const yes = Flag.Boolean('yes').pipe(
  Flag.withAlias('y'),
  Flag.withAlias('force'),
  Flag.withAlias('f'),
  Flag.withDefault(false),
  Flag.withDescription('Skip confirmation prompts')
);

/** Without a terminal to confirm on, an agent logout needs `--yes`. */
const NEEDS_YES_MESSAGE =
  '`composio logout` needs --yes when not running interactively: it removes the stored Composio agent key.';

/**
 * CLI command to log out from the Composio CLI. An agent logout removes the stored agent key, so
 * it asks first; without a terminal to ask on it needs `--yes` and otherwise fails with a
 * `CommandInputError`. Declining the prompt logs nothing out and exits 0.
 *
 * @example
 * ```bash
 * composio logout
 * ```
 */
export const logoutCmd = Command.make('logout', { yes }, ({ yes }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;

    if (!ctx.isLoggedIn()) {
      yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
      return;
    }

    const loggedInAgent = yield* getCurrentLoggedInAgent;
    if (Option.isSome(loggedInAgent) && !yes) {
      const { canPrompt } = yield* ui.capabilities;
      if (!canPrompt) {
        return yield* commandInputError('logout')(NEEDS_YES_MESSAGE, '--yes');
      }
      yield* ui.note(
        [
          `You are logged in as a Composio agent (${loggedInAgent.value.email ?? loggedInAgent.value.slug ?? 'unknown'}).`,
          `Logging out will remove ~/.composio/${AGENT_CONFIG_FILE_NAME}, including the stored composio_agent_key.`,
          'Save that key before continuing if you may need this exact agent again.',
          'Without the key, you cannot run `composio agent login <composio_agent_key>` for this agent unless it has been claimed by a human admin.',
        ].join('\n'),
        'Agent Logout Warning'
      );

      const confirmed = yield* ui.confirm('Remove the stored Composio agent key and log out?', {
        defaultValue: false,
      });
      if (!confirmed) {
        yield* ui.log.warn('Agent logout cancelled. No credentials were removed.');
        return;
      }
    }

    yield* ctx.logout;
    yield* clearApolloIdentityForAnalytics;

    if (Option.isSome(loggedInAgent)) {
      yield* removeStoredAgentIdentity;
      yield* ui.log.success('Logged out and removed stored Composio agent key.');
      return;
    }

    yield* ui.log.success('Logged out successfully.');
  })
).pipe(Command.withDescription('Log out from the Composio SDK.'));
