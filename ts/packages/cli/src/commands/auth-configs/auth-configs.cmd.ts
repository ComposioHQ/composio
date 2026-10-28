import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { authConfigsCmd$List } from './list/auth-configs.list.cmd';
import { authConfigsCmd$Info } from './info/auth-configs.info.cmd';
import { authConfigsCmd$Create } from './create/auth-configs.create.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

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
  withRegisteredSubcommands([authConfigsCmd$List, authConfigsCmd$Info, authConfigsCmd$Create]),
  requireLogin
);
