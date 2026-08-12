import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import {
  RUN_COMPANION_RELEASE_TAG_FILENAME,
  resolveRunningCliReleaseTag,
  resolveRunningCliVersion,
} from 'src/services/run-companion-modules';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

describe('running CLI version authority', () => {
  layer(TestPlatform)(it => {
    it.scoped('uses the compiled version in release builds despite installed tag metadata', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const installDirectory = yield* fs.makeTempDirectoryScoped();
        const execPath = path.join(installDirectory, 'composio');

        for (const installedTag of ['@composio/cli@9.9.9', '@composio/cli@0.2.31']) {
          yield* fs.writeFileString(
            path.join(installDirectory, RUN_COMPANION_RELEASE_TAG_FILENAME),
            installedTag
          );

          expect(yield* resolveRunningCliVersion(execPath, '0.3.0', true)).toBe('0.3.0');
          expect(yield* resolveRunningCliReleaseTag(execPath, '0.3.0', true)).toBe(
            '@composio/cli@0.3.0'
          );
        }
      })
    );

    it.scoped('uses the compiled version in a release build without installed metadata', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const installDirectory = yield* fs.makeTempDirectoryScoped();
        const execPath = path.join(installDirectory, 'composio');

        expect(yield* resolveRunningCliVersion(execPath, '0.3.0', true)).toBe('0.3.0');
        expect(yield* resolveRunningCliReleaseTag(execPath, '0.3.0', true)).toBe(
          '@composio/cli@0.3.0'
        );
      })
    );

    it.scoped('keeps installed tag fallback behavior in development builds', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const installDirectory = yield* fs.makeTempDirectoryScoped();
        const execPath = path.join(installDirectory, 'composio');
        const releaseTagPath = path.join(installDirectory, RUN_COMPANION_RELEASE_TAG_FILENAME);
        yield* fs.writeFileString(releaseTagPath, '@composio/cli@0.2.31');

        expect(yield* resolveRunningCliVersion(execPath, '0.0.0-development', false)).toBe(
          '0.2.31'
        );
        expect(yield* resolveRunningCliReleaseTag(execPath, '0.0.0-development', false)).toBe(
          '@composio/cli@0.2.31'
        );

        yield* fs.remove(releaseTagPath);

        expect(yield* resolveRunningCliVersion(execPath, '0.0.0-development', false)).toBe(
          '0.0.0-development'
        );
        expect(yield* resolveRunningCliReleaseTag(execPath, '0.0.0-development', false)).toBe(
          '@composio/cli@0.0.0-development'
        );
      })
    );
  });
});
