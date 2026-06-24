import { Command } from '@effect/cli';
import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import {
  fetchAgentWhoami,
  resolveStoredAgentKey,
  safeAgentSummary,
  writeStoredAgentIdentity,
} from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

export const agentCmd$Whoami = Command.make('whoami', {}).pipe(
  Command.withDescription('Show the stored Composio agent identity.'),
  Command.withHandler(() =>
    handleAgentAuthError(
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const agentKey = yield* resolveStoredAgentKey;
        const identity = yield* fetchAgentWhoami(agentKey);
        const saved = yield* writeStoredAgentIdentity(identity);
        const summary = safeAgentSummary(saved);

        yield* ui.note(
          [
            `Type: agent`,
            `Status: ${summary.status}`,
            `Email: ${summary.email ?? 'unknown'}`,
            `Slug: ${summary.slug ?? 'unknown'}`,
            `Current Org ID: ${summary.org_id ?? 'pending'}`,
            `Project ID: ${summary.project_id ?? 'pending'}`,
            `Claimed By: ${summary.claimed_by ?? 'not claimed'}`,
          ].join('\n'),
          'Composio Agent'
        );
        yield* ui.output(JSON.stringify(summary));
      })
    )
  )
);
