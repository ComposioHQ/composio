import { Command } from '@effect/cli';
import { toolsCmd$List } from './commands/tools.list.cmd';
import { toolsCmd$Info } from './commands/tools.info.cmd';

export const rootToolsCmd = Command.make('tools').pipe(
  Command.withDescription('Browse and inspect tools before executing them.'),
  Command.withSubcommands([toolsCmd$List, toolsCmd$Info])
);
