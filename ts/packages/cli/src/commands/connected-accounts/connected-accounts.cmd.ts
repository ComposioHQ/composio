import { Command } from '@effect/cli';
import { connectedAccountsCmd$List } from './commands/connected-accounts.list.cmd';
import { connectedAccountsCmd$Info } from './commands/connected-accounts.info.cmd';
import { connectedAccountsCmd$Whoami } from './commands/connected-accounts.whoami.cmd';
import { connectedAccountsCmd$Delete } from './commands/connected-accounts.delete.cmd';

/**
 * CLI entry point for connected account management commands.
 *
 * @example
 * ```bash
 * composio dev connected-accounts <command>
 * ```
 */
export const connectedAccountsCmd = Command.make('connected-accounts').pipe(
  Command.withDescription('View and manage Composio connected accounts.'),
  Command.withSubcommands([
    connectedAccountsCmd$List,
    connectedAccountsCmd$Info,
    connectedAccountsCmd$Whoami,
    connectedAccountsCmd$Delete,
  ])
);
