/**
 * Release artifact identity: which platform/arch each published archive targets,
 * and which companion assets belong inside it.
 *
 * Deliberately free of Bun-only imports so the packaging rules stay unit-testable
 * under Node.
 */

import { Data, Either } from 'effect';
import {
  RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS,
  runCompanionStaticAssetRelativePathsFor,
} from '../src/services/run-companion-modules';

export type ReleaseArtifactTarget = {
  readonly artifactName: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
};

/**
 * Every published binary artifact, mapped to the Node `platform`/`arch` pair its
 * archive runs on. Artifact names use the `aarch64` spelling; Node calls the same
 * architecture `arm64`.
 */
export const RELEASE_ARTIFACT_TARGETS: ReadonlyArray<ReleaseArtifactTarget> = [
  { artifactName: 'composio-darwin-aarch64', platform: 'darwin', arch: 'arm64' },
  { artifactName: 'composio-darwin-x64', platform: 'darwin', arch: 'x64' },
  { artifactName: 'composio-linux-x64', platform: 'linux', arch: 'x64' },
  { artifactName: 'composio-linux-aarch64', platform: 'linux', arch: 'arm64' },
];

/**
 * Known binary artifact names (without extension).
 */
export const ARTIFACT_NAMES: ReadonlyArray<string> = RELEASE_ARTIFACT_TARGETS.map(
  target => target.artifactName
);

export class UnknownReleaseArtifactError extends Data.TaggedError(
  'scripts/UnknownReleaseArtifactError'
)<{
  readonly artifactName: string;
}> {
  get message(): string {
    return `Unknown release artifact ${this.artifactName}. Expected one of: ${ARTIFACT_NAMES.join(', ')}.`;
  }
}

/**
 * Resolve an artifact name to its platform/arch. The mapping is total over
 * {@link RELEASE_ARTIFACT_TARGETS}; anything else fails instead of silently
 * producing an archive with no platform-specific assets.
 */
export const releaseArtifactTargetFor = (
  artifactName: string
): Either.Either<ReleaseArtifactTarget, UnknownReleaseArtifactError> =>
  Either.fromNullable(
    RELEASE_ARTIFACT_TARGETS.find(target => target.artifactName === artifactName),
    () => new UnknownReleaseArtifactError({ artifactName })
  );

/**
 * Narrow the full multi-platform companion asset list down to the assets one
 * archive should ship: the portable ones plus the single codex-acp binary that
 * archive's platform can execute.
 *
 * An archive already carries a platform-specific `composio` binary, so a
 * darwin-arm64 archive is unusable on linux-x64 no matter which codex-acp
 * binaries travel with it. Shipping foreign ones only inflates the download.
 */
export const archiveCompanionRelativePaths = ({
  allRelativePaths,
  target,
}: {
  readonly allRelativePaths: ReadonlyArray<string>;
  readonly target: ReleaseArtifactTarget;
}): ReadonlyArray<string> => {
  const included = new Set(runCompanionStaticAssetRelativePathsFor(target));
  const excluded = new Set(
    RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS.filter(
      relativePath => !included.has(relativePath)
    )
  );

  return allRelativePaths.filter(relativePath => !excluded.has(relativePath));
};
