import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import { claimAgent, resolveStoredAgentKey } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';
import { claimInviteSentMessage, formatAgentClaimJson } from './agent.claim.format';

/** The argument of `composio agent claim`. */
export type AgentClaimParams = {
  readonly email: string;
};

/**
 * Invites `email` as an admin of the stored agent's org. A missing or human login is reported
 * by `handleAgentAuthError` and exits 1.
 */
export const runAgentClaim = ({ email }: AgentClaimParams) =>
  handleAgentAuthError(
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const agentKey = yield* resolveStoredAgentKey;
      const result = yield* claimAgent({ agentKey, email });

      yield* ui.log.success(claimInviteSentMessage(result.email ?? email));
      yield* ui.output(formatAgentClaimJson(result, email));
    })
  );
