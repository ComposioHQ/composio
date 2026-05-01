import { Args, Command } from '@effect/cli';
import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import { claimAgent, resolveStoredAgentKey } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

const email = Args.text({ name: 'email' }).pipe(
  Args.withDescription('Human email address to invite as an admin for this agent org')
);

export const agentCmd$Claim = Command.make('claim', { email }).pipe(
  Command.withDescription('Invite a human admin to claim this agent org.'),
  Command.withHandler(({ email }) =>
    handleAgentAuthError(
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const agentKey = yield* resolveStoredAgentKey;
        const result = yield* claimAgent({ agentKey, email });

        yield* ui.log.success(`Sent Composio org claim invite to ${result.email ?? email}.`);
        yield* ui.output(
          JSON.stringify({
            status: result.status ?? 'invited',
            email: result.email ?? email,
            org_id: result.org_id ?? null,
            invite_code: result.invite_code ?? null,
          })
        );
      })
    )
  )
);
