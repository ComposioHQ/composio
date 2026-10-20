import { Command, Flag } from 'effect/cli';
import { runAgentSignup } from './agent.signup.handler';

const noWait = Flag.Boolean('no-wait').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Start agent signup and exit without waiting for credentials')
);

const noLogin = Flag.Boolean('no-login').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Create or verify the agent identity without logging the CLI in')
);

const force = Flag.Boolean('force').pipe(
  Flag.withAlias('f'),
  Flag.withDefault(false),
  Flag.withDescription('Create a new agent identity even if ~/.composio/agent.json already exists')
);

export const agentCmd$Signup = Command.make(
  'signup',
  { noWait, noLogin, force },
  runAgentSignup
).pipe(Command.withDescription('Sign up and optionally log in as a Composio agent.'));
