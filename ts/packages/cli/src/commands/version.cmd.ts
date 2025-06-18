import { Command } from '@effect/cli';
import { Effect, Console } from 'effect';
import { getVersion } from 'src/effects/version';

/**
 * CLI command to display the version of the Composio CLI.
 *
 * @example
 * ```bash
 * composio version
 * ```
 */
export const versionCmd = Command.make('version', {}).pipe(
  Command.withDescription('Display your account information.'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const version = yield* getVersion;
      yield* Console.log(`${version}`);

      yield* Effect.logDebug('Composio CLI version command executed successfully.');
    })
  )
);
