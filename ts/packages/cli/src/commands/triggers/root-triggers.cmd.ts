import { Command } from '@effect/cli';
import { rootTriggersCmd$Info } from './commands/triggers.info.cmd';
import { rootTriggersCmd$List } from './commands/triggers.list.cmd';

export const rootTriggersCmd = Command.make('triggers').pipe(
  Command.withDescription('Browse and inspect trigger types before creating subscriptions.'),
  Command.withSubcommands([rootTriggersCmd$List, rootTriggersCmd$Info])
);
