import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { rejectsProjectName } from 'src/commands/surface';
import { connectedAccountsCmd$List } from './commands/connected-accounts.list.cmd';
import { connectedAccountsCmd$Info } from './commands/connected-accounts.info.cmd';
import { connectedAccountsCmd$Whoami } from './commands/connected-accounts.whoami.cmd';
import { connectedAccountsCmd$Link } from './link/connected-accounts.link.cmd';

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
    connectedAccountsCmd$Link,
    connectedAccountsCmd$List,
    connectedAccountsCmd$Info.pipe(rejectsProjectName('dev connected-accounts info')),
    connectedAccountsCmd$Whoami.pipe(rejectsProjectName('dev connected-accounts whoami')),
  ]),
  requireLogin
);
