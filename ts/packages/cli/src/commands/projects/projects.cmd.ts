import { Command } from 'effect/cli';
import { projectsCmd$List } from './list/projects.list.cmd';
import { projectsCmd$Switch } from './switch/projects.switch.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

/**
 * CLI entry point for project context commands.
 */
export const projectsCmd = Command.make('projects').pipe(
  Command.withDescription('Inspect developer projects and project context helpers.'),
  withRegisteredSubcommands([projectsCmd$List, projectsCmd$Switch])
);
