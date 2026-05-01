import { Command } from '@effect/cli';
import { agentCmd$Claim } from './commands/agent.claim.cmd';
import { agentCmd$Inbox } from './commands/agent.inbox.cmd';
import { agentCmd$Login } from './commands/agent.login.cmd';
import { agentCmd$Signup } from './commands/agent.signup.cmd';
import { agentCmd$Whoami } from './commands/agent.whoami.cmd';

export const agentCmd = Command.make('agent').pipe(
  Command.withDescription('Manage Composio agent identity, inbox, and handoff.'),
  Command.withSubcommands([
    agentCmd$Signup,
    agentCmd$Login,
    agentCmd$Whoami,
    agentCmd$Claim,
    agentCmd$Inbox,
  ])
);
