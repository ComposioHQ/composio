import { Command } from '@effect/cli';
import {
  outputOpt,
  compact,
  transpiled,
  typeTools,
  toolkitsOpt,
  handleTsGenerate,
} from '../ts/commands/ts.generate.cmd';

/**
 * `composio generate ts` — Generate TypeScript type stubs.
 */
export const generateCmd$Ts = Command.make('ts', {
  outputOpt,
  compact,
  transpiled,
  typeTools,
  toolkitsOpt,
}).pipe(
  Command.withDescription('Generate TypeScript type stubs for toolkits, tools, and triggers.'),
  Command.withHandler(handleTsGenerate)
);
