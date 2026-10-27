import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { orgsCmd$List } from './list/orgs.list.cmd';
import { orgsCmd$Switch } from './switch/orgs.switch.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

/**
 * CLI entry point for organization context commands.
 */
export const orgsCmd = Command.make('orgs').pipe(
  Command.withDescription('Manage default global organization/project context.'),
  withRegisteredSubcommands([orgsCmd$List, orgsCmd$Switch]),
  requireLogin
);
