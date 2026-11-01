import { Argument, Command, Flag } from 'effect/cli';
import { runTriggersList } from './triggers.list.handler';

const toolkit = Argument.String('toolkit').pipe(
  Argument.withDescription('Toolkit slug to list trigger types for (e.g. "gmail")')
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Maximum number of trigger types to show (1-1000)')
);

export const triggersCmd$List = Command.make('list', { toolkit, limit }, runTriggersList).pipe(
  Command.withDescription('List available trigger types.')
);
