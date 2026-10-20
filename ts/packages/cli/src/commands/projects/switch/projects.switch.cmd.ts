import { Command } from 'effect/cli';
import { runProjectsSwitch } from './projects.switch.handler';

export const projectsCmd$Switch = Command.make('switch', {}, runProjectsSwitch).pipe(
  Command.withDescription('Switch the developer project for this directory.')
);
