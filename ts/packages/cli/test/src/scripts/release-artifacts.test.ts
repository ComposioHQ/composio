import { Either, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  RUN_CODEX_ACP_BINARY_TARGETS,
  RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS,
  RUN_COMPANION_MODULE_FILENAMES,
  RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
} from '../../../src/services/run-companion-modules';
import {
  archiveCompanionRelativePaths,
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

describe('archiveCompanionRelativePaths', () => {
  it.each(RELEASE_ARTIFACT_TARGETS)(
    'ships only $platform-$arch codex-acp in $artifactName',
    target => {
      const selected = archiveCompanionRelativePaths({
        allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
        target,
      });

      expect(codexAcpRelativePathsIn(selected)).toEqual([
        `acp-adapters/codex/${target.platform}-${target.arch}/codex-acp`,
      ]);
    }
  );

  it.each(RELEASE_ARTIFACT_TARGETS)('keeps portable assets in $artifactName', target => {
    const selected = archiveCompanionRelativePaths({
      allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
      target,
    });

    expect(selected).toEqual(
      expect.arrayContaining([
        ...RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
        ...RUN_COMPANION_MODULE_FILENAMES,
        ...RUN_COMPANION_MODULE_FILENAMES.map(fileName => `services/${fileName}`),
      ])
    );
  });

  it.each(RELEASE_ARTIFACT_TARGETS)(
    'drops exactly the foreign codex-acp binaries from $artifactName',
    target => {
      const selected = archiveCompanionRelativePaths({
        allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
        target,
      });

      const dropped = ALL_COMPANION_RELATIVE_PATHS.filter(
        relativePath => !selected.includes(relativePath)
      );

      expect(dropped).toEqual(
        RUN_CODEX_ACP_BINARY_TARGETS.filter(
          codexTarget =>
            codexTarget.platform !== target.platform || codexTarget.arch !== target.arch
        )
          .map(codexTarget => codexTarget.relativePath)
          .sort()
      );
      expect(dropped).toHaveLength(RUN_CODEX_ACP_BINARY_TARGETS.length - 1);
    }
  );

  it('leaves an already-narrowed list untouched', () => {
    const target = RELEASE_ARTIFACT_TARGETS[0]!;
    const selected = archiveCompanionRelativePaths({
      allRelativePaths: ALL_COMPANION_RELATIVE_PATHS,
      target,
    });

    expect(archiveCompanionRelativePaths({ allRelativePaths: selected, target })).toEqual(selected);
  });
});
