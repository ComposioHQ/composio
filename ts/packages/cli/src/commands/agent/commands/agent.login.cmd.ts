import { Effect } from 'effect';
import { Argument, Command } from 'effect/cli';
import { completeAgentLogin } from 'src/effects/complete-agent-login';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import {
  ensureAgentSignupAllowed,
  fetchAgentWhoami,
  writeStoredAgentIdentity,
} from 'src/services/agents';

const composioAgentKey = Argument.String('composio_agent_key').pipe(
  Argument.withDescription('Composio agent key for an existing agent identity')
);

export const agentCmd$Login = Command.make('login', { composioAgentKey }).pipe(
  Command.withDescription('Log in with an existing Composio agent key.'),
  Command.withHandler(({ composioAgentKey }) =>
    handleAgentAuthError(
      Effect.gen(function* () {
        yield* ensureAgentSignupAllowed;
        const identity = yield* fetchAgentWhoami(composioAgentKey);
        const saved = yield* writeStoredAgentIdentity(identity);
        yield* completeAgentLogin(saved);
      })
    )
  )
);
