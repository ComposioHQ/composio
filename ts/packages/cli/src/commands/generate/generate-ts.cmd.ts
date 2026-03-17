import { Command } from '@effect/cli';
import { Option } from 'effect';
import {
  generateTypescriptTypeStubs,
  outputOpt,
  compact,
  transpiled,
  typeTools,
  toolkitsOpt,
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
  Command.withHandler(params => {
    const shouldCompile = params.transpiled || !Option.isSome(params.outputOpt);
    return generateTypescriptTypeStubs({
      ...params,
      compact: params.compact,
      transpiled: shouldCompile,
    });
  })
);
