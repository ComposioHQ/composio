import { Command } from '@effect/cli';
import { toolkitsCmd } from '../toolkits/toolkits.cmd';
import { authConfigsCmd } from '../auth-configs/auth-configs.cmd';
import { connectedAccountsCmd } from '../connected-accounts/connected-accounts.cmd';
import { triggersCmd } from '../triggers/triggers.cmd';
import { orgsCmd } from '../orgs/orgs.cmd';
import { projectsCmd } from '../projects/projects.cmd';

/**
 * CLI entry point for developer management commands.
 *
 * Groups orgs, toolkits, connected-accounts, triggers, auth-configs, and projects
 * under a single `composio manage` namespace.
 *
 * @example
 * ```bash
 * composio manage <command>
 * composio manage toolkits list
 * composio manage projects list
 * ```
 */
export const manageCmd = Command.make('manage').pipe(
  Command.withDescription(
    'Manage your developer orgs, toolkits, connected accounts, triggers, auth configs, and projects.'
  ),
  Command.withSubcommands([
    toolkitsCmd,
    authConfigsCmd,
    connectedAccountsCmd,
    triggersCmd,
    orgsCmd,
    projectsCmd,
  ])
);
