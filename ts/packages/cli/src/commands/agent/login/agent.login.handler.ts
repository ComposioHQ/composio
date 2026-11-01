import { Effect } from 'effect';
import { completeAgentLogin } from 'src/effects/complete-agent-login';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import {
  ensureAgentSignupAllowed,
  fetchAgentWhoami,
  writeStoredAgentIdentity,
} from 'src/services/agents';

/** The argument of `composio agent login`. */
export type AgentLoginParams = {
  readonly composioAgentKey: string;
};

/**
 * Looks the key up with the agents API, stores the identity, and logs the CLI in with it. A
 * human login, or an identity without credentials yet, is reported by `handleAgentAuthError`
 * and exits 1.
 */
export const runAgentLogin = ({ composioAgentKey }: AgentLoginParams) =>
  handleAgentAuthError(
    Effect.gen(function* () {
      yield* ensureAgentSignupAllowed;
      const identity = yield* fetchAgentWhoami(composioAgentKey);
      const saved = yield* writeStoredAgentIdentity(identity);
      yield* completeAgentLogin(saved);
    })
  );
