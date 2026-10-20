import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { orgsCmd$List } from './list/orgs.list.cmd';
import { orgsCmd$Switch } from './commands/orgs.switch.cmd';

/**
 * CLI entry point for organization context commands.
 */
export const orgsCmd = Command.make('orgs').pipe(
  Command.withDescription('Manage default global organization/project context.'),
  Command.withSubcommands([orgsCmd$List, orgsCmd$Switch]),
  requireLogin
);
