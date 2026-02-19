import { Command } from '@effect/cli';
import { Effect } from 'effect';
import { getVersion } from 'src/effects/version';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * CLI command to display the version of the Composio CLI.
 *
 * @example
 * ```bash
 * composio version
 * ```
 */
export const versionCmd = Command.make('version', {}).pipe(
  Command.withDescription('Display the current Composio CLI version.'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const version = yield* getVersion;
      yield* ui.log.info(version);
      yield* ui.output(version);

      yield* Effect.logDebug('Composio CLI version command executed successfully.');
    })
  )
);
