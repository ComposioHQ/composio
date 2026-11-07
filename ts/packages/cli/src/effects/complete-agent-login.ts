import { Effect } from 'effect';
import { loginWithAgentIdentity, safeAgentSummary, type AgentIdentity } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * Stores an agent identity's credential as the CLI's login and reports it: the success line on
 * stderr, the identity summary with `logged_in: true` on stdout. Shared by `composio agent
 * login` and the agent paths of `composio login`, so both print the same payload.
 */
export const completeAgentLogin = (identity: AgentIdentity) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* loginWithAgentIdentity(identity);
    const summary = safeAgentSummary(identity);
    yield* ui.log.success(`Logged in as Composio agent ${summary.email ?? summary.slug ?? ''}`);
    yield* ui.output(JSON.stringify({ ...summary, logged_in: true }));
  });
