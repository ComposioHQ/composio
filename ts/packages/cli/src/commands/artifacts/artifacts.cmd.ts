import { Command } from 'effect/cli';
import { artifactsCmd$Cwd } from './cwd/artifacts.cwd.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

export const artifactsCmd = Command.make('artifacts').pipe(
  Command.withDescription('Inspect session artifact directories.'),
  withRegisteredSubcommands([artifactsCmd$Cwd])
);
