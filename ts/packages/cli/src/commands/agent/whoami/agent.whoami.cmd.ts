import { Command } from 'effect/cli';
import { runAgentWhoami } from './agent.whoami.handler';

export const agentCmd$Whoami = Command.make('whoami', {}, runAgentWhoami).pipe(
  Command.withDescription('Show the stored Composio agent identity.')
);
