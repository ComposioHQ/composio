import { Command } from '@effect/cli';
import { initCmd } from './init.cmd';
import { triggersCmd$Listen } from './triggers/commands/triggers.listen.cmd';
import { logsCmd } from './logs-cmd/logs.cmd';
import { devToolsCmd$Execute } from './tools/commands/tools.execute.cmd';

export const devCmd = Command.make('dev').pipe(
  Command.withDescription(
    'Developer workflows: initialize a local project, execute tools with playground users, listen for triggers, and inspect logs.'
  ),
  Command.withSubcommands([initCmd, devToolsCmd$Execute, triggersCmd$Listen, logsCmd])
);
