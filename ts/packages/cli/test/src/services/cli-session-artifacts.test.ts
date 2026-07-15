import { FileSystem, Path } from '@effect/platform';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { storeCliSessionArtifact } from 'src/services/cli-session-artifacts';
import { TestLive } from 'test/__utils__';

describe('CLI session artifacts', () => {
  layer(TestLive())(it => {
    it.scoped('stores a sanitized artifact with the requested extension', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directoryPath = yield* fs.makeTempDirectoryScoped();

        const filePath = yield* storeCliSessionArtifact({
          contents: '{"ok":true}',
          name: 'github issue output',
          extension: '.json',
          directoryPath,
        });

        expect(filePath).toBeDefined();
        if (filePath === undefined) {
          return yield* Effect.die('Expected the session artifact to be stored');
        }
        expect(path.dirname(filePath)).toBe(directoryPath);
        expect(path.basename(filePath)).toMatch(/^github_issue_output_[a-f0-9]{8}\.json$/i);
        expect(yield* fs.readFileString(filePath)).toBe('{"ok":true}');
      })
    );

    it.scoped('returns undefined when the artifact directory cannot be created', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const filePath = yield* fs.makeTempFileScoped();

        expect(
          yield* storeCliSessionArtifact({
            contents: '{}',
            name: 'output',
            directoryPath: filePath,
          })
        ).toBeUndefined();
      })
    );
  });
});
