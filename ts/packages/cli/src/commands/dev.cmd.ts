import { Command } from '@effect/cli';
import { initCmd } from './init.cmd';
import { triggersCmd$Listen } from './triggers/commands/triggers.listen.cmd';
import { logsCmd } from './logs-cmd/logs.cmd';
import { devToolsCmd$Execute } from './tools/commands/tools.execute.cmd';
import { toolkitsCmd } from './toolkits/toolkits.cmd';
import { authConfigsCmd } from './auth-configs/auth-configs.cmd';
import { connectedAccountsCmd } from './connected-accounts/connected-accounts.cmd';
import { triggersCmd } from './triggers/triggers.cmd';
import { orgsCmd } from './orgs/orgs.cmd';
import { projectsCmd } from './projects/projects.cmd';

export const devCmd = Command.make('dev').pipe(
  Command.withDescription(
    'Developer workflows: initialize local project context, test tool executions against playground users, inspect logs, and manage orgs, projects, toolkits, auth configs, accounts, and triggers.'
  ),
  Command.withSubcommands([
    initCmd,
    devToolsCmd$Execute,
    triggersCmd$Listen,
    logsCmd,
    toolkitsCmd,
    authConfigsCmd,
    connectedAccountsCmd,
    triggersCmd,
    orgsCmd,
    projectsCmd,
  ])
);
