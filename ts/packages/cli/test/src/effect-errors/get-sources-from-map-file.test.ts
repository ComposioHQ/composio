import { describe, expect, it } from '@effect/vitest';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect } from 'effect';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getSourcesFromMapFile } from 'src/effect-errors/sourcemaps/get-sources-from-map-file';

const locationFor = (filePath: string) => ({ filePath, line: 1, column: 0 });

const run = (filePath: string) =>
  getSourcesFromMapFile('app.js', locationFor(filePath)).pipe(
    Effect.provide([BunFileSystem.layer, BunPath.layer]),
    Effect.either
  );

describe('getSourcesFromMapFile', () => {
  it.scoped('falls back to the raw location when the .map file is missing', () =>
    Effect.gen(function* () {
      const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'composio-sourcemap-')));
      yield* Effect.addFinalizer(() => Effect.promise(() => rm(dir, { recursive: true, force: true })));

      const result = yield* run(join(dir, 'app.js'));

      expect(result._tag).toBe('Right');
      if (result._tag === 'Right') {
        expect(result.right?._tag).toBe('location');
      }
    })
  );

  it.scoped('falls back to the raw location when the .map file is malformed instead of failing capture', () =>
    Effect.gen(function* () {
      const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'composio-sourcemap-')));
      yield* Effect.addFinalizer(() => Effect.promise(() => rm(dir, { recursive: true, force: true })));

      yield* Effect.promise(() => writeFile(join(dir, 'app.js.map'), '{ this is not valid json', 'utf8'));

      const result = yield* run(join(dir, 'app.js'));

      // A malformed map must not surface a JsonParsingError; it should
      // behave like a missing map and return the raw location.
      expect(result._tag).toBe('Right');
      if (result._tag === 'Right') {
        expect(result.right?._tag).toBe('location');
      }
    })
  );
});
