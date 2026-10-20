import { Command } from 'effect/cli';
import { artifactsCmd$Cwd } from './cwd/artifacts.cwd.cmd';

export const artifactsCmd = Command.make('artifacts').pipe(
  Command.withDescription('Inspect session artifact directories.'),
  Command.withSubcommands([artifactsCmd$Cwd])
);
