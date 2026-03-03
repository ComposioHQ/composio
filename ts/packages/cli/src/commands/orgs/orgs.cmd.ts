import { Command } from '@effect/cli';
import { orgsCmd$List } from './commands/orgs.list.cmd';
import { orgsCmd$Switch } from './commands/orgs.switch.cmd';

/**
 * CLI entry point for organization context commands.
 */
export const orgsCmd = Command.make('orgs').pipe(
  Command.withDescription('Manage default global organization/project context.'),
  Command.withSubcommands([orgsCmd$List, orgsCmd$Switch])
);
