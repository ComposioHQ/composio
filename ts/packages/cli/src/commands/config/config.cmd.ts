import { Command } from 'effect/cli';
import { configExperimentalCmd } from './config.experimental.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

export const configCmd = Command.make('config').pipe(
  Command.withDescription('View and manage CLI configuration.'),
  withRegisteredSubcommands([configExperimentalCmd])
);
