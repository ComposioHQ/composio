import { Command } from '@effect/cli';
import { connectionsCmd$List } from './commands/connections.list.cmd';

export const rootConnectionsCmd = Command.make('connections').pipe(
  Command.withDescription('Inspect connected toolkit accounts in a script-friendly format.'),
  Command.withSubcommands([connectionsCmd$List])
);
