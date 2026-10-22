import { Argument, Command, Flag } from 'effect/cli';
import { runTriggersCreate } from './triggers.create.handler';

const triggerName = Argument.String('trigger-name').pipe(
  Argument.withDescription('Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")'),
  Argument.optional
);

const connectedAccountId = Flag.String('connected-account-id').pipe(
  Flag.withDescription('Connected account ID (nanoid)'),
  Flag.optional
);

const triggerConfig = Flag.String('trigger-config').pipe(
  Flag.withDescription('Trigger config as JSON string'),
  Flag.optional
);

export const triggersCmd$Create = Command.make(
  'create',
  { triggerName, connectedAccountId, triggerConfig },
  runTriggersCreate
).pipe(Command.withDescription('Create a new trigger instance.'));
