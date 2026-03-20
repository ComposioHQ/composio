import { Command } from '@effect/cli';
import { toolkitsCmd } from '../toolkits/toolkits.cmd';
import { toolsCmd } from '../tools/tools.cmd';
import { authConfigsCmd } from '../auth-configs/auth-configs.cmd';
import { connectedAccountsCmd } from '../connected-accounts/connected-accounts.cmd';
import { triggersCmd } from '../triggers/triggers.cmd';
import { logsCmd } from '../logs-cmd/logs.cmd';
import { orgsCmd } from '../orgs/orgs.cmd';
import { projectsCmd } from '../projects/projects.cmd';

/**
 * CLI entry point for management commands.
 *
 * Groups toolkits, tools, auth-configs, connected-accounts, triggers, logs, orgs, and projects
 * under a single `composio manage` namespace.
 *
 * @example
 * ```bash
 * composio manage <command>
 * composio manage toolkits list
 * composio manage tools search "send email"
 * ```
 */
export const manageCmd = Command.make('manage').pipe(
  Command.withDescription(
    'Developer/admin workflows: orgs, toolkits, tools, accounts, triggers, logs, auth configs, and deprecated project commands.'
  ),
  Command.withSubcommands([
    toolkitsCmd,
    toolsCmd,
    authConfigsCmd,
    connectedAccountsCmd,
    triggersCmd,
    logsCmd,
    orgsCmd,
    projectsCmd,
  ])
);
