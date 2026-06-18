import { Command } from '@effect/cli';
import { localToolsCmd$Configure } from './commands/local-tools.configure.cmd';
import { localToolsCmd$Doctor } from './commands/local-tools.doctor.cmd';
import { localToolsCmd$List } from './commands/local-tools.list.cmd';
import { localToolsCmd$Meta } from './commands/local-tools.meta.cmd';

export const localToolsCmd = Command.make('local-tools').pipe(
  Command.withDescription('Inspect and configure registered local CLI tools.'),
  Command.withSubcommands([
    localToolsCmd$List,
    localToolsCmd$Doctor,
    localToolsCmd$Configure,
    localToolsCmd$Meta,
  ])
);
