import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import { getVersion } from 'src/effects/version';
import { getUpdateStatus } from 'src/services/update-check';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold, cyanBright } from 'src/ui/colors';

const check = Options.boolean('check').pipe(
  Options.withDescription(
    'Check for a newer stable release and print a machine-readable JSON status ' +
      '({current, latestStable, updateAvailable, checkStatus, lastChecked}). ' +
      'Refreshes the release cache when it is older than 24 hours.'
  )
);

/**
 * CLI command to display the version of the Composio CLI.
 *
 * @example
 * ```bash
 * composio version
 * composio version --check
 * ```
 */
export const versionCmd = Command.make('version', { check }).pipe(
  Command.withDescription('Display the current Composio CLI version.'),
  Command.withHandler(({ check }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;

      if (check) {
        const status = yield* getUpdateStatus;
        if (status.updateAvailable && status.latestStable) {
          yield* ui.log.info(
            `Update available: ${status.current} → ${bold(cyanBright(status.latestStable))} — run ${cyanBright('composio upgrade')}`
          );
        } else if (status.checkStatus === 'unknown') {
          yield* ui.log.warn('Unable to determine the latest stable Composio CLI release.');
        } else {
          yield* ui.log.info(`${status.current} is up to date.`);
        }
        yield* ui.output(JSON.stringify(status));
        return;
      }

      const version = yield* getVersion;
      yield* ui.log.info(version);
      yield* ui.output(version);

      yield* Effect.logDebug('Composio CLI version command executed successfully.');
    })
  )
);
