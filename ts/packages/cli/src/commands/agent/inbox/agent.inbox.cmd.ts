import { Command, Flag } from 'effect/cli';
import { runAgentInbox } from './agent.inbox.handler';

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(50),
  Flag.withDescription('Maximum number of inbox messages to fetch')
);

export const agentCmd$Inbox = Command.make('inbox', { limit }, runAgentInbox).pipe(
  Command.withDescription('Read the stored Composio agent inbox.')
);
