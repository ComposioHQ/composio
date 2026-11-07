import { Command } from 'effect/cli';
import { agentCmd$Claim } from './claim/agent.claim.cmd';
import { agentCmd$Inbox } from './inbox/agent.inbox.cmd';
import { agentCmd$Login } from './login/agent.login.cmd';
import { agentCmd$Signup } from './signup/agent.signup.cmd';
import { agentCmd$Whoami } from './whoami/agent.whoami.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

export const agentCmd = Command.make('agent').pipe(
  Command.withDescription('Manage Composio agent identity, inbox, and handoff.'),
  withRegisteredSubcommands([
    agentCmd$Signup,
    agentCmd$Login,
    agentCmd$Whoami,
    agentCmd$Claim,
    agentCmd$Inbox,
  ])
);
