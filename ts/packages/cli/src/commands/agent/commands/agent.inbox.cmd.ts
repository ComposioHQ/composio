import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import { fetchAgentInbox, resolveStoredAgentKey } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

const limit = Options.integer('limit').pipe(
  Options.withDefault(50),
  Options.withDescription('Maximum number of inbox messages to fetch')
);

export const agentCmd$Inbox = Command.make('inbox', { limit }).pipe(
  Command.withDescription('Read the stored Composio agent inbox.'),
  Command.withHandler(({ limit }) =>
    handleAgentAuthError(
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const agentKey = yield* resolveStoredAgentKey;
        const inbox = yield* fetchAgentInbox({ agentKey, limit });

        yield* ui.output(JSON.stringify(inbox), { force: true });
      })
    )
  )
);
