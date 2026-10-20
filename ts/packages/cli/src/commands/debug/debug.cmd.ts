import { Command } from 'effect/cli';
import { debugCmd$ApiInfo } from './api-info/debug.api-info.cmd';
import { debugCmd$GenerateGraph } from './generate-graph/debug.generate-graph.cmd';
import { debugCmd$WhoIsMyMaster } from './who-is-my-master/debug.who-is-my-master.cmd';

export const debugCmd = Command.make('debug').pipe(
  Command.unlisted,
  Command.withDescription('Internal CLI diagnostics.'),
  Command.withSubcommands([debugCmd$GenerateGraph, debugCmd$ApiInfo, debugCmd$WhoIsMyMaster])
);
