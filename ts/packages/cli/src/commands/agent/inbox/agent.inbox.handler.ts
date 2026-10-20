import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import { fetchAgentInbox, resolveStoredAgentKey } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

/** The flags of `composio agent inbox`. */
export type AgentInboxParams = {
  readonly limit: number;
};

/**
 * Prints the stored agent's inbox as the agents API returns it, on stdout even when stdout is a
 * terminal: the JSON is the whole output. A missing or human login is reported by
 * `handleAgentAuthError` and exits 1.
 */
export const runAgentInbox = ({ limit }: AgentInboxParams) =>
  handleAgentAuthError(
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const agentKey = yield* resolveStoredAgentKey;
      const inbox = yield* fetchAgentInbox({ agentKey, limit });

      yield* ui.output(JSON.stringify(inbox), { force: true });
    })
  );
