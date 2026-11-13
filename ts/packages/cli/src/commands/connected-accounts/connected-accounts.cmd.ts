import { withCommandMeta } from 'src/invocation/command-identity';
import { Command } from 'effect/cli';
import { connectedAccountsCmd$List } from './list/connected-accounts.list.cmd';
import { connectedAccountsCmd$Info } from './info/connected-accounts.info.cmd';
import { connectedAccountsCmd$Whoami } from './whoami/connected-accounts.whoami.cmd';
import { connectedAccountsCmd$Link } from './link/connected-accounts.link.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

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
  withRegisteredSubcommands([
    connectedAccountsCmd$Link,
    connectedAccountsCmd$List,
    connectedAccountsCmd$Info.pipe(withCommandMeta({ sharedFlags: { userId: false } })),
    connectedAccountsCmd$Whoami.pipe(withCommandMeta({ sharedFlags: { userId: false } })),
  ]),
  withCommandMeta({ requiresLogin: true })
);
