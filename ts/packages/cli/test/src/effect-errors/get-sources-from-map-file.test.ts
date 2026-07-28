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

  it.scoped('falls back to the raw location when the .map is valid JSON but a structurally invalid source map', () =>
    Effect.gen(function* () {
      const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'composio-sourcemap-')));
      yield* Effect.addFinalizer(() => Effect.promise(() => rm(dir, { recursive: true, force: true })));

      // Parses as valid JSON and passes the version/sources presence check,
      // but SourceMapConsumer rejects it (unsupported version 2, no mappings).
      const structurallyInvalidMap = JSON.stringify({
        version: 2,
        sources: [],
        names: [],
        mappings: '',
      });
      yield* Effect.promise(() => writeFile(join(dir, 'app.js.map'), structurallyInvalidMap, 'utf8'));

      const result = yield* run(join(dir, 'app.js'));

      // A structurally invalid map must not abort the pipeline; it should
      // fall back to the raw location just like a missing/malformed map.
      expect(result._tag).toBe('Right');
      if (result._tag === 'Right') {
        expect(result.right?._tag).toBe('location');
      }
    })
  );

  it.scoped('falls back to the raw location when the .map has a valid v3 envelope but no mappings', () =>
    Effect.gen(function* () {
      const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'composio-sourcemap-')));
      yield* Effect.addFinalizer(() => Effect.promise(() => rm(dir, { recursive: true, force: true })));

      // Valid JSON, v3, has sources, but the mappings field is absent,
      // causing originalPositionFor to throw internally.
      const mapWithoutMappings = JSON.stringify({
        version: 3,
        sources: ['src/app.ts'],
      });
      yield* Effect.promise(() => writeFile(join(dir, 'app.js.map'), mapWithoutMappings, 'utf8'));

      const result = yield* run(join(dir, 'app.js'));

      expect(result._tag).toBe('Right');
      if (result._tag === 'Right') {
        expect(result.right?._tag).toBe('location');
      }
    })
  );
});
