import { Command } from 'effect/cli';
import { runDebugGenerateGraph } from './debug.generate-graph.handler';

export const debugCmd$GenerateGraph = Command.make(
  'generate-graph',
  {},
  runDebugGenerateGraph
).pipe(Command.unlisted);
