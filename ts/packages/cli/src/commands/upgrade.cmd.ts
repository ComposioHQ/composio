import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { APP_VERSION } from 'src/constants';
import { UpgradeBinary } from 'src/services/upgrade-binary';
import { installSkillSafe } from 'src/effects/install-skill';

const betaOpt = Options.boolean('beta').pipe(
  Options.withAlias('b'),
  Options.withDefault(false),
  Options.withDescription('Upgrade to the latest beta CLI release instead of the stable channel')
);

const versionArg = Args.text({ name: 'version' }).pipe(
  Args.withDescription(
    'Install a specific CLI release (e.g. "0.13.1", "0.13.1-beta.42", or full tag "@composio/cli@0.13.1"). If omitted, installs the latest release.'
  ),
  Args.optional
);

const RELEASE_TAG_PREFIX = '@composio/cli@';

const normalizeReleaseTag = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed.startsWith(RELEASE_TAG_PREFIX)) return trimmed;
  // Allow leading "v" for friendliness, e.g. "v0.13.1"
  const stripped = trimmed.replace(/^v/, '');
  return `${RELEASE_TAG_PREFIX}${stripped}`;
};

/**
 * CLI command to upgrade the CLI to the latest available version,
 * or to install a specific version when one is provided.
 *
 * @example
 * ```bash
 * composio upgrade
 * composio upgrade 0.13.1
 * composio upgrade 0.13.1-beta.42
 * composio upgrade --beta
 * ```
 */
export const upgradeCmd = Command.make(
  'upgrade',
  { beta: betaOpt, version: versionArg },
  ({ beta, version }) =>
    Effect.gen(function* () {
      const upgradeBinary = yield* UpgradeBinary;
      const tag = Option.isSome(version) ? normalizeReleaseTag(version.value) : undefined;
      const newReleaseTag = yield* upgradeBinary.upgrade({ prerelease: beta, tag });
      yield* installSkillSafe({
        releaseTag: newReleaseTag ?? tag ?? `@composio/cli@${APP_VERSION}`,
      });
    })
).pipe(
  Command.withDescription(
    'Upgrade your Composio CLI. Pass a version (e.g. "0.13.1" or "0.13.1-beta.42") to install a specific release, or omit it to install the latest.'
  )
);
