import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { connectionsCmd$List } from './commands/connections.list.cmd';
import { connectionsCmd$Remove } from './remove/connections.remove.cmd';

export const rootConnectionsCmd = Command.make('connections').pipe(
  Command.withDescription('Inspect and remove connected toolkit accounts.'),
  Command.withSubcommands([connectionsCmd$List, connectionsCmd$Remove]),
  requireLogin
);
