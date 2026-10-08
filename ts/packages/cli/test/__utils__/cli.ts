import { Effect } from 'effect';
import * as Cli from 'src/commands';

// Run CLI in test environment. `bootstrap` stands in for the values `cli-main.ts` resolves before
// routing the root command (currently the `composio run` id).
export const cli = (args: ReadonlyArray<string>, bootstrap?: Cli.RootCommandBootstrap) =>
  Effect.flatMap(Cli.runWithConfig, run => run(['node', '<CMD>', ...args], bootstrap));
