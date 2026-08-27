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

export type ArchiveCompanionEntryKind = 'copy' | 'placeholder';

export type ArchiveCompanionEntry = {
  readonly relativePath: string;
  readonly kind: ArchiveCompanionEntryKind;
};

/**
 * Decide how each companion asset enters one archive.
 *
 * An archive already carries a platform-specific `composio` binary, so only one
 * of the four codex-acp binaries inside it can ever execute. The other three are
 * ~651 MB that every machine unpacking this archive downloads, stores, and can
 * never run.
 *
 * They cannot simply be dropped. A CLI released before 2026-08-18 verifies a
 * downloaded upgrade package against all four codex-acp paths and refuses to
 * install one that is missing any of them, so omitting them breaks
 * `composio upgrade` for every client already in the field. An empty placeholder
 * satisfies that existence check at zero bytes, and no host ever executes a
 * foreign codex-acp binary, so the placeholder is never read.
 *
 * Once no supported client performs that check, placeholders can become plain
 * omissions.
 */
export const archiveCompanionEntries = ({
  allRelativePaths,
  target,
}: {
  readonly allRelativePaths: ReadonlyArray<string>;
  readonly target: ReleaseArtifactTarget;
}): ReadonlyArray<ArchiveCompanionEntry> => {
  const executableHere = new Set(runCompanionStaticAssetRelativePathsFor(target));
  const foreignCodexPaths = new Set(
    RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS.filter(
      relativePath => !executableHere.has(relativePath)
    )
  );

  return allRelativePaths.map(relativePath => ({
    relativePath,
    kind: foreignCodexPaths.has(relativePath) ? ('placeholder' as const) : ('copy' as const),
  }));
};
