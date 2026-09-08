import { Either, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  RUN_CODEX_ACP_BINARY_TARGETS,
  RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS,
  RUN_COMPANION_MODULE_FILENAMES,
  RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
} from '../../../src/services/run-companion-modules';
import {
  archiveCompanionEntries,
  ARTIFACT_NAMES,
  RELEASE_ARTIFACT_TARGETS,
  releaseArtifactTargetFor,
  UnknownReleaseArtifactError,
} from '../../../scripts/_release-artifacts';

/**
 * Everything `collectExpectedRunCompanionAssetRelativePaths` yields for a fully
 * populated companions directory: the wrappers, their bundled services, and the
 * multi-platform static asset set.
 */
const ALL_COMPANION_RELATIVE_PATHS: ReadonlyArray<string> = [
  ...RUN_COMPANION_MODULE_FILENAMES,
  ...RUN_COMPANION_MODULE_FILENAMES.map(fileName => `services/${fileName}`),
  ...RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS,
].sort();

const codexAcpRelativePathsIn = (relativePaths: ReadonlyArray<string>): ReadonlyArray<string> =>
  relativePaths.filter(relativePath => relativePath.endsWith('/codex-acp'));

describe('releaseArtifactTargetFor', () => {
  it('maps every published artifact name to a Node platform/arch pair', () => {
    expect(
      RELEASE_ARTIFACT_TARGETS.map(({ artifactName, platform, arch }) => [
        artifactName,
        `${platform}-${arch}`,
      ])
    ).toEqual([
      ['composio-darwin-aarch64', 'darwin-arm64'],
      ['composio-darwin-x64', 'darwin-x64'],
      ['composio-linux-x64', 'linux-x64'],
      ['composio-linux-aarch64', 'linux-arm64'],
    ]);
  });

  it.each(ARTIFACT_NAMES)('resolves %s', artifactName => {
    const target = releaseArtifactTargetFor(artifactName);

    expect(Either.isRight(target)).toBe(true);
  });

  it('covers every codex-acp binary target exactly once', () => {
    const artifactTargets = RELEASE_ARTIFACT_TARGETS.map(
      ({ platform, arch }) => `${platform}-${arch}`
    ).sort();
    const codexTargets = RUN_CODEX_ACP_BINARY_TARGETS.map(
      ({ platform, arch }) => `${platform}-${arch}`
    ).sort();

    expect(artifactTargets).toEqual(codexTargets);
  });

  it.each(['composio-linux-arm64', 'composio-windows-x64', 'composio', ''])(
    'rejects the unknown artifact name %o',
    artifactName => {
      const target = releaseArtifactTargetFor(artifactName);

      const error = Option.getOrUndefined(Either.getLeft(target));

      expect(error).toBeInstanceOf(UnknownReleaseArtifactError);
      expect(error?.message).toContain('Unknown release artifact');
    }
  );
});

describe('archiveCompanionEntries', () => {
  const pathsOfKind = (
    entries: ReadonlyArray<{ relativePath: string; kind: string }>,
    kind: string
  ): ReadonlyArray<string> =>
    entries.filter(entry => entry.kind === kind).map(entry => entry.relativePath);

  it.each(RELEASE_ARTIFACT_TARGETS)(
    'names every codex-acp path in $artifactName so older clients still verify',
    target => {
      const entries = archiveCompanionEntries({
        allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
        target,
      });

      expect(entries.map(entry => entry.relativePath)).toEqual(ALL_COMPANION_RELATIVE_PATHS);
    }
  );

  it.each(RELEASE_ARTIFACT_TARGETS)(
    'carries real bytes only for the $platform-$arch codex-acp binary',
    target => {
      const entries = archiveCompanionEntries({
        allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
        target,
      });

      expect(codexAcpRelativePathsIn(pathsOfKind(entries, 'copy'))).toEqual([
        `acp-adapters/codex/${target.platform}-${target.arch}/codex-acp`,
      ]);
    }
  );

  it.each(RELEASE_ARTIFACT_TARGETS)(
    'placeholders exactly the foreign codex-acp binaries in $artifactName',
    target => {
      const entries = archiveCompanionEntries({
        allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
        target,
      });

      expect(pathsOfKind(entries, 'placeholder')).toEqual(
        RUN_CODEX_ACP_BINARY_TARGETS.filter(
          codexTarget =>
            codexTarget.platform !== target.platform || codexTarget.arch !== target.arch
        ).map(codexTarget => codexTarget.relativePath)
      );
    }
  );

  it.each(RELEASE_ARTIFACT_TARGETS)('copies the portable assets into $artifactName', target => {
    const entries = archiveCompanionEntries({
      allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
      target,
    });

    expect(pathsOfKind(entries, 'copy')).toEqual(
      expect.arrayContaining([
        ...RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
        ...RUN_COMPANION_MODULE_FILENAMES,
        ...RUN_COMPANION_MODULE_FILENAMES.map(fileName => `services/${fileName}`),
      ])
    );
  });
});

/**
 * Packaging names {@link RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS} in every
 * archive, because a CLI released before 2026-08-18 verifies an upgrade package
 * against all four codex-acp paths and refuses one that is missing any of them.
 */
describe('published archive companion coverage', () => {
  it.each(RUN_CODEX_ACP_BINARY_TARGETS)(
    'names the $platform-$arch codex-acp binary in every archive',
    codexTarget => {
      expect(RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS).toContain(codexTarget.relativePath);
    }
  );

  it('covers one codex-acp binary per release artifact', () => {
    expect(codexAcpRelativePathsIn(RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS)).toHaveLength(
      RELEASE_ARTIFACT_TARGETS.length
    );
  });

  it('keeps the portable assets alongside them', () => {
    expect(RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS).toEqual(
      expect.arrayContaining([...RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS])
    );
  });
});
