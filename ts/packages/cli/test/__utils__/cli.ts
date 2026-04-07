import { Effect } from 'effect';
import * as Cli from 'src/commands';

// Run CLI in test environment
export const cli = (args: ReadonlyArray<string>): Effect.Effect<void, unknown, any> =>
  Effect.flatMap(Cli.runWithConfig, run => run(['node', '<CMD>', ...args]));
