import { Args, Command } from '@effect/cli';
import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import {
  ensureAgentSignupAllowed,
  fetchAgentWhoami,
  loginWithAgentIdentity,
  safeAgentSummary,
  writeStoredAgentIdentity,
} from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

const composioAgentKey = Args.text({ name: 'composio_agent_key' }).pipe(
  Args.withDescription('Composio agent key for an existing agent identity')
);

export const agentCmd$Login = Command.make('login', { composioAgentKey }).pipe(
  Command.withDescription('Log in with an existing Composio agent key.'),
  Command.withHandler(({ composioAgentKey }) =>
    handleAgentAuthError(
      Effect.gen(function* () {
        const ui = yield* TerminalUI;

        yield* ensureAgentSignupAllowed;

        const identity = yield* fetchAgentWhoami(composioAgentKey);
        const saved = yield* writeStoredAgentIdentity(identity);
        yield* loginWithAgentIdentity(saved);

        const summary = safeAgentSummary(saved);
        yield* ui.log.success(`Logged in as Composio agent ${summary.email ?? summary.slug ?? ''}`);
        yield* ui.output(JSON.stringify({ ...summary, logged_in: true }));
      })
    )
  )
);
