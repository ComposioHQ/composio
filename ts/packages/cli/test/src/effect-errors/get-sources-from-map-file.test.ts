import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import { Cause, Effect, Layer, Scope } from 'effect';
import { type RawSourceMap, SourceMapConsumer } from 'source-map-js';

import { captureErrors } from 'src/effect-errors/capture-errors';
import { getSourcesFromMapFile } from 'src/effect-errors/sourcemaps/get-sources-from-map-file';

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);
const locationFor = (filePath: string) => ({ filePath, line: 1, column: 0 });

const makeSourceMapFixture = (
  mapContents: string,
  options: { readonly directory?: string; readonly sourceContents?: string } = {}
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({
      directory: options.directory,
      prefix: 'composio-sourcemap-',
    });
    const generatedFile = path.join(directory, 'app.js');

    yield* fs.writeFileString(`${generatedFile}.map`, mapContents);
    if (options.sourceContents !== undefined) {
      yield* fs.writeFileString(path.join(directory, 'app.ts'), options.sourceContents);
    }

    return { directory, generatedFile };
  });

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>) =>
  effect.pipe(Effect.provide(TestPlatform));

describe('getSourcesFromMapFile', () => {
  it.scoped('falls back to the full raw location when source-map JSON is malformed', () =>
    run(
      Effect.gen(function* () {
        const { generatedFile } = yield* makeSourceMapFixture('{ this is not valid JSON');
        const location = locationFor(generatedFile);

        expect(yield* getSourcesFromMapFile('app.js', location)).toStrictEqual({
          _tag: 'location',
          name: 'app.js',
          ...location,
        });
      })
    )
  );

  it.scoped('falls back when valid JSON is not a usable source map', () =>
    run(
      Effect.gen(function* () {
        const invalidSourceMap = JSON.stringify({
          version: 2,
          sources: [],
          names: [],
          mappings: '',
        });
        const { generatedFile } = yield* makeSourceMapFixture(invalidSourceMap);
        const location = locationFor(generatedFile);

        expect(yield* getSourcesFromMapFile('app.js', location)).toStrictEqual({
          _tag: 'location',
          name: 'app.js',
          ...location,
        });
      })
    )
  );

  it.scoped('falls back when source-map resolution rejects schema-valid data', () =>
    run(
      Effect.gen(function* () {
        const invalidSourceMap = {
          version: '3',
          sources: ['app.ts'],
          names: [],
          mappings: '!',
        } satisfies RawSourceMap;
        expect(() =>
          new SourceMapConsumer(invalidSourceMap).originalPositionFor({
            line: 1,
            column: 0,
          })
        ).toThrow('Invalid base64 digit');

        const { generatedFile } = yield* makeSourceMapFixture(JSON.stringify(invalidSourceMap));
        const location = locationFor(generatedFile);

        expect(yield* getSourcesFromMapFile('app.js', location)).toStrictEqual({
          _tag: 'location',
          name: 'app.js',
          ...location,
        });
      })
    )
  );

  it.scoped('falls back when the map points at a source file that was never shipped', () =>
    run(
      Effect.gen(function* () {
        const validSourceMap = JSON.stringify({
          version: 3,
          file: 'app.js',
          sources: ['app.ts'],
          names: [],
          mappings: 'AAAA',
        });
        // No `sourceContents`, so `app.ts` does not exist next to the map.
        const { generatedFile } = yield* makeSourceMapFixture(validSourceMap);
        const location = locationFor(generatedFile);

        expect(yield* getSourcesFromMapFile('app.js', location)).toStrictEqual({
          _tag: 'location',
          name: 'app.js',
          ...location,
        });
      })
    )
  );

  it.scoped('falls back when the .map path is a directory rather than a file', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'composio-sourcemap-' });
        const generatedFile = path.join(directory, 'app.js');
        yield* fs.makeDirectory(`${generatedFile}.map`);
        const location = locationFor(generatedFile);

        expect(yield* getSourcesFromMapFile('app.js', location)).toStrictEqual({
          _tag: 'location',
          name: 'app.js',
          ...location,
        });
      })
    )
  );

  it.scoped('enriches maps that use null for the optional file and sourceRoot keys', () =>
    run(
      Effect.gen(function* () {
        const sourceContents = "throw new Error('primary diagnostic');\n";
        // `source-map-js` accepts both; rejecting them would silently drop
        // enrichment for maps emitted without an output file name.
        const nullableSourceMap = JSON.stringify({
          version: 3,
          file: null,
          sourceRoot: null,
          sources: ['app.ts'],
          names: [],
          mappings: 'AAAA',
        });
        const { directory, generatedFile } = yield* makeSourceMapFixture(nullableSourceMap, {
          sourceContents,
        });
        const path = yield* Path.Path;

        expect(yield* getSourcesFromMapFile('app.js', locationFor(generatedFile))).toMatchObject({
          _tag: 'sources',
          sourcesPath: `${path.join(directory, 'app.ts')}:1:1`,
        });
      })
    )
  );

  it.scoped('still enriches locations from valid source maps', () =>
    run(
      Effect.gen(function* () {
        const sourceContents = "throw new Error('primary diagnostic');\n";
        const validSourceMap = JSON.stringify({
          version: 3,
          file: 'app.js',
          sources: ['app.ts'],
          names: [],
          mappings: 'AAAA',
        });
        const { directory, generatedFile } = yield* makeSourceMapFixture(validSourceMap, {
          sourceContents,
        });
        const path = yield* Path.Path;

        expect(yield* getSourcesFromMapFile('app.js', locationFor(generatedFile))).toStrictEqual({
          _tag: 'sources',
          name: 'app.js',
          runPath: `${generatedFile}:1:0`,
          sourcesPath: `${path.join(directory, 'app.ts')}:1:1`,
          source: [
            { line: 1, code: "throw new Error('primary diagnostic');", column: 1 },
            { line: 2, code: '', column: undefined },
          ],
        });
      })
    )
  );

  it.scoped('preserves the primary diagnostic through captureErrors', () =>
    run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workingDirectory = path.resolve('.');
        const { generatedFile } = yield* makeSourceMapFixture('{ malformed', {
          directory: workingDirectory,
        });
        const primary = new Error('primary diagnostic');
        primary.stack = `Error: primary diagnostic\n    at ${generatedFile}:1:0`;

        const captured = yield* captureErrors(Cause.die(primary));

        expect(captured.errors).toHaveLength(1);
        expect(captured.errors[0]).toMatchObject({
          errorType: 'Error',
          message: ['primary diagnostic'],
          location: [
            {
              name: '',
              filePath: generatedFile.replace(workingDirectory, ''),
              line: 1,
              column: 0,
            },
          ],
        });
      })
    )
  );

  it.scoped('preserves the primary diagnostic when the original source is missing', () =>
    run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workingDirectory = path.resolve('.');
        const validSourceMap = JSON.stringify({
          version: 3,
          file: 'app.js',
          sources: ['app.ts'],
          names: [],
          mappings: 'AAAA',
        });
        // A valid map whose original source was never shipped — the common
        // shape for a compiled binary — must not abort error capture either.
        const { generatedFile } = yield* makeSourceMapFixture(validSourceMap, {
          directory: workingDirectory,
        });
        const primary = new Error('primary diagnostic');
        primary.stack = `Error: primary diagnostic\n    at ${generatedFile}:1:0`;

        const captured = yield* captureErrors(Cause.die(primary));

        expect(captured.errors).toHaveLength(1);
        expect(captured.errors[0]).toMatchObject({
          errorType: 'Error',
          message: ['primary diagnostic'],
          location: [
            {
              name: '',
              filePath: generatedFile.replace(workingDirectory, ''),
              line: 1,
              column: 0,
            },
          ],
        });
      })
    )
  );

  it.scoped('preserves the primary diagnostic when a .ts frame is unreadable', () =>
    run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fs = yield* FileSystem.FileSystem;
        const workingDirectory = path.resolve('.');
        const directory = yield* fs.makeTempDirectoryScoped({
          directory: workingDirectory,
          prefix: 'composio-sourcemap-',
        });
        // TypeScript frames skip source maps entirely and read the file
        // directly; a deleted file must degrade rather than abort.
        const missingSource = path.join(directory, 'missing.ts');
        const primary = new Error('primary diagnostic');
        primary.stack = `Error: primary diagnostic\n    at ${missingSource}:1:0`;

        const captured = yield* captureErrors(Cause.die(primary));

        expect(captured.errors).toHaveLength(1);
        expect(captured.errors[0]).toMatchObject({
          errorType: 'Error',
          message: ['primary diagnostic'],
          location: [
            {
              name: '',
              filePath: missingSource.replace(workingDirectory, ''),
              line: 1,
              column: 0,
            },
          ],
        });
      })
    )
  );
});
