import { Command } from '@effect/cli';
import { Effect } from 'effect';
import { APP_VERSION } from 'src/constants';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { installSkillSafe } from 'src/effects/install-skill';

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
    const newReleaseTag = yield* upgradeBinary.upgrade();
    yield* installSkillSafe({ releaseTag: newReleaseTag ?? `@composio/cli@${APP_VERSION}` });
  })
).pipe(Command.withDescription('Upgrade your Composio CLI to the latest available version.'));
