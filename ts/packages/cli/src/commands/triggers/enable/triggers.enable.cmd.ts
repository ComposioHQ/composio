import { Argument, Command } from 'effect/cli';
import { runTriggersEnable } from './triggers.enable.handler';

const id = Argument.String('id').pipe(
  Argument.withDescription('Trigger instance ID'),
  Argument.optional
);

export const triggersCmd$Enable = Command.make('enable', { id }, runTriggersEnable).pipe(
  Command.withDescription('Enable a trigger instance.')
);
