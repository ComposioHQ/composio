import { Command } from '@effect/cli';
import { authConfigsCmd$List } from './commands/auth-configs.list.cmd';
import { authConfigsCmd$Info } from './commands/auth-configs.info.cmd';
import { authConfigsCmd$Create } from './commands/auth-configs.create.cmd';
import { authConfigsCmd$Delete } from './commands/auth-configs.delete.cmd';

/**
 * CLI entry point for auth config management commands.
 *
 * @example
 * ```bash
 * composio dev auth-configs <command>
 * ```
 */
export const authConfigsCmd = Command.make('auth-configs').pipe(
  Command.withDescription('View and manage Composio auth configs.'),
  Command.withSubcommands([
    authConfigsCmd$List,
    authConfigsCmd$Info,
    authConfigsCmd$Create,
    authConfigsCmd$Delete,
  ])
);
