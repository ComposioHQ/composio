import { Command, Options } from '@effect/cli';
import { runAgentSignup } from '../../signup.cmd';

const noWait = Options.boolean('no-wait').pipe(
  Options.withDefault(false),
  Options.withDescription('Start agent signup and exit without waiting for credentials')
);

const noLogin = Options.boolean('no-login').pipe(
  Options.withDefault(false),
  Options.withDescription('Create or verify the agent identity without logging the CLI in')
);

const force = Options.boolean('force').pipe(
  Options.withAlias('f'),
  Options.withDefault(false),
  Options.withDescription(
    'Create a new agent identity even if ~/.composio/agent.json already exists'
  )
);

export const agentCmd$Signup = Command.make(
  'signup',
  { noWait, noLogin, force },
  ({ noWait, noLogin, force }) =>
    runAgentSignup({ noWait, noLogin, force, commandLabel: 'composio agent signup' })
).pipe(Command.withDescription('Sign up and optionally log in as a Composio agent.'));
