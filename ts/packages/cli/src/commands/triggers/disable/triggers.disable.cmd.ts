import { Argument, Command, Flag } from 'effect/cli';
import { runTriggersDisable } from './triggers.disable.handler';

const id = Argument.String('id').pipe(
  Argument.withDescription('Trigger instance ID'),
  Argument.optional
);

const dangerouslyAllow = Flag.Boolean('dangerously-allow').pipe(
  Flag.withDescription('Acknowledge disabling this trigger instance'),
  Flag.withDefault(false)
);

export const triggersCmd$Disable = Command.make(
  'disable',
  { id, dangerouslyAllow },
  runTriggersDisable
).pipe(Command.withDescription('Disable a trigger instance.'));
