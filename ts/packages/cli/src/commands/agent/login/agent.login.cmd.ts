import { Argument, Command } from 'effect/cli';
import { runAgentLogin } from './agent.login.handler';

const composioAgentKey = Argument.String('composio_agent_key').pipe(
  Argument.withDescription('Composio agent key for an existing agent identity')
);

export const agentCmd$Login = Command.make('login', { composioAgentKey }, runAgentLogin).pipe(
  Command.withDescription('Log in with an existing Composio agent key.')
);
