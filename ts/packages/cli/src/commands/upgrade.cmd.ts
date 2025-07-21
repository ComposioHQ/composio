import { Command } from '@effect/cli';
import { Effect } from 'effect';
import { UpgradeBinary } from 'src/services/upgrade-binary';

/**
 * CLI command to upgrade the CLI to the latest available version.
 *
 * @example
 * ```bash
 * composio upgrade
 * ```
 */
export const upgradeCmd = Command.make('upgrade', {}, () =>
  Effect.gen(function* () {
    const upgradeBinary = yield* UpgradeBinary;
    yield* upgradeBinary.upgrade();
  })
).pipe(Command.withDescription('Upgrade your Composio CLI to the latest available version.'));
