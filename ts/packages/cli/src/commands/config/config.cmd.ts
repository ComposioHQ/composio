import { Command } from 'effect/unstable/cli';
import { configExperimentalCmd } from './config.experimental.cmd';

export const configCmd = Command.make('config').pipe(
  Command.withDescription('View and manage CLI configuration.'),
  Command.withSubcommands([configExperimentalCmd])
);
