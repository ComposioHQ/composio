import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import {
  AGENT_CONFIG_FILE_NAME,
  getCurrentLoggedInAgent,
  removeStoredAgentIdentity,
} from 'src/services/agents';
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
const force = Options.boolean('force').pipe(
  Options.withAlias('f'),
  Options.withDefault(false),
  Options.withDescription('Skip confirmation prompts')
);

export const logoutCmd = Command.make('logout', { force }, ({ force }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;

    if (!ctx.isLoggedIn()) {
      yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
      return;
    }

    const loggedInAgent = yield* getCurrentLoggedInAgent;
    if (Option.isSome(loggedInAgent) && !force) {
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

    if (Option.isSome(loggedInAgent)) {
      yield* removeStoredAgentIdentity;
      yield* ui.log.success('Logged out and removed stored Composio agent key.');
      return;
    }

    yield* ui.log.success('Logged out successfully.');
  })
).pipe(Command.withDescription('Log out from the Composio SDK.'));
