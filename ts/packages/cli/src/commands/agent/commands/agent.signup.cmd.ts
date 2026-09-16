import { Command, Flag } from 'effect/unstable/cli';
import { runAgentSignup } from '../../signup.cmd';

const noWait = Flag.boolean('no-wait').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Start agent signup and exit without waiting for credentials')
);

const noLogin = Flag.boolean('no-login').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Create or verify the agent identity without logging the CLI in')
);

const force = Flag.boolean('force').pipe(
  Flag.withAlias('f'),
  Flag.withDefault(false),
  Flag.withDescription('Create a new agent identity even if ~/.composio/agent.json already exists')
);

export const agentCmd$Signup = Command.make(
  'signup',
  { noWait, noLogin, force },
  ({ noWait, noLogin, force }) =>
    runAgentSignup({ noWait, noLogin, force, commandLabel: 'composio agent signup' })
).pipe(Command.withDescription('Sign up and optionally log in as a Composio agent.'));
