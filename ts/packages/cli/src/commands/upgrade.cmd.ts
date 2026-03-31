import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import { APP_VERSION } from 'src/constants';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { installSkillSafe } from 'src/effects/install-skill';

const betaOpt = Options.boolean('beta').pipe(
  Options.withAlias('b'),
  Options.withDefault(false),
  Options.withDescription('Upgrade to the latest beta CLI release instead of the stable channel')
);

/**
 * CLI command to upgrade the CLI to the latest available version.
 *
 * @example
 * ```bash
 * composio upgrade
 * ```
 */
export const upgradeCmd = Command.make('upgrade', { beta: betaOpt }, ({ beta }) =>
  Effect.gen(function* () {
    const upgradeBinary = yield* UpgradeBinary;
    const newReleaseTag = yield* upgradeBinary.upgrade({ prerelease: beta });
    yield* installSkillSafe({ releaseTag: newReleaseTag ?? `@composio/cli@${APP_VERSION}` });
  })
).pipe(Command.withDescription('Upgrade your Composio CLI to the latest available version.'));
