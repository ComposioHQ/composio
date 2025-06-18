import { Effect } from 'effect';
import * as Cli from 'src/commands';

// Run CLI in test environment
export const cli = (args: ReadonlyArray<string>) =>
  Effect.flatMap(Cli.runWithConfig, run => run(['node', '<CMD>', ...args])) satisfies Effect.Effect<
    void,
    any,
    any
  >;
