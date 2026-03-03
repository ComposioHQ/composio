import { Command } from '@effect/cli';
import { projectsCmd$List } from './commands/projects.list.cmd';
import { projectsCmd$Switch } from './commands/projects.switch.cmd';

/**
 * CLI entry point for project context commands.
 */
export const projectsCmd = Command.make('projects').pipe(
  Command.withDescription('Manage default global project context.'),
  Command.withSubcommands([projectsCmd$List, projectsCmd$Switch])
);
