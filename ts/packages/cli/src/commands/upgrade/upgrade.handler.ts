import { Effect, Option } from 'effect';
import { APP_VERSION } from 'src/constants';
import { installSkillSafe } from 'src/effects/install-skill';
import { UpgradeBinary } from 'src/services/upgrade-binary';

/** The flags and argument of `composio upgrade`. */
export type UpgradeParams = {
  readonly beta: boolean;
  readonly version: Option.Option<string>;
};

const RELEASE_TAG_PREFIX = '@composio/cli@';

/**
 * The release tag a version argument names: a full `@composio/cli@…` tag as given, otherwise the
 * version (a leading `v` allowed, e.g. `v0.13.1`) under the CLI's tag prefix.
 */
export const normalizeReleaseTag = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed.startsWith(RELEASE_TAG_PREFIX)) return trimmed;
  const stripped = trimmed.replace(/^v/, '');
  return `${RELEASE_TAG_PREFIX}${stripped}`;
};

/**
 * Replaces the running binary with the requested release, or the latest one on the chosen
 * channel, then installs the skill of whichever release is now installed: the new one, else the
 * requested one, else the running version's.
 */
export const runUpgrade = ({ beta, version }: UpgradeParams) =>
  Effect.gen(function* () {
    const upgradeBinary = yield* UpgradeBinary;
    const tag = Option.getOrUndefined(Option.map(version, normalizeReleaseTag));
    const newReleaseTag = yield* upgradeBinary.upgrade({ prerelease: beta, tag });
    yield* installSkillSafe({
      releaseTag: newReleaseTag ?? tag ?? `${RELEASE_TAG_PREFIX}${APP_VERSION}`,
    });
  });
