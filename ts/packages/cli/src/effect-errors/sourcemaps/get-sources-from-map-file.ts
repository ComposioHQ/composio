import type { PlatformError } from '@effect/platform/Error';
import { FileSystem } from '@effect/platform/FileSystem';
import { Path } from '@effect/platform/Path';
import { Data, Effect, Option, Schema, pipe } from 'effect';
import { SourceMapConsumer } from 'source-map-js';

import { readJsonEffect } from 'effect-errors/dependencies/fs';

import type { ErrorLocation } from './get-error-location-from-file-path';
import { getSourceCode } from './get-source-code';
import { type ErrorRelatedSources, MappedSources, type RawErrorLocation } from './mapped-sources';

/**
 * Structural subset of the Source Map v3 spec that `originalPositionFor` needs.
 *
 * `file` and `sourceRoot` are nullable, not merely absent: bundlers emitting a
 * map with no output file name write `"file": null` rather than omitting the
 * key, and `source-map-js` accepts both. Rejecting them here would silently
 * downgrade a perfectly usable map to an unenriched location.
 */
const SourceMapSchema = Schema.Struct({
  version: Schema.Literal(3, '3'),
  sources: Schema.Array(Schema.String),
  names: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  mappings: Schema.String,
  file: Schema.optional(Schema.NullOr(Schema.String)),
  sourceRoot: Schema.optional(Schema.NullOr(Schema.String)),
});
const decodeSourceMap = Schema.decodeUnknownOption(SourceMapSchema);

class SourceMapResolutionError extends Data.TaggedError('SourceMapResolutionError')<{
  readonly filePath: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Could not resolve source-map location for ${this.filePath}`;
  }
}

const rawErrorLocation = (
  name: string,
  location: ErrorLocation,
  workingDirectory: string
): RawErrorLocation =>
  MappedSources.location({
    name,
    ...location,
    filePath: location.filePath.replace(workingDirectory, ''),
  });

const resolveOriginalPosition = (sourceMap: typeof SourceMapSchema.Type, location: ErrorLocation) =>
  Effect.try({
    try: () =>
      new SourceMapConsumer({
        version: String(sourceMap.version),
        sources: [...sourceMap.sources],
        names: [...sourceMap.names],
        mappings: sourceMap.mappings,
        file: sourceMap.file ?? undefined,
        sourceRoot: sourceMap.sourceRoot ?? undefined,
      }).originalPositionFor({
        column: location.column,
        line: location.line,
      }),
    catch: cause => new SourceMapResolutionError({ filePath: location.filePath, cause }),
  }).pipe(
    Effect.map(Option.some),
    Effect.catchTag('SourceMapResolutionError', () => Effect.succeed(Option.none()))
  );

/**
 * Enriches `location` with the original source it maps to.
 *
 * Fails with a `PlatformError` when the map file, or the original source it
 * points at, cannot be read; `getSourcesFromMapFile` turns that into the raw
 * location.
 */
const enrichFromMapFile = (
  name: string,
  location: ErrorLocation,
  workingDirectory: string
): Effect.Effect<
  ErrorRelatedSources | RawErrorLocation | undefined,
  PlatformError,
  FileSystem | Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const fileExists = yield* fs.exists(`${location.filePath}.map`);
    if (!fileExists) {
      return rawErrorLocation(name, location, workingDirectory);
    }

    const sourceMap = yield* readJsonEffect(`${location.filePath}.map`).pipe(
      Effect.map(Option.fromNullable),
      Effect.map(Option.flatMap(decodeSourceMap)),
      Effect.catchTag('JsonParsingError', () => Effect.succeed(Option.none()))
    );
    if (Option.isNone(sourceMap)) {
      return rawErrorLocation(name, location, workingDirectory);
    }

    const maybeSources = yield* resolveOriginalPosition(sourceMap.value, location);
    if (Option.isNone(maybeSources)) {
      return rawErrorLocation(name, location, workingDirectory);
    }

    const sources = maybeSources.value;
    if (sources.source === null || sources.line === null || sources.column === null) {
      return;
    }

    const absolutePath = path.resolve(path.dirname(location.filePath), sources.source);
    const isNodeModules = absolutePath.startsWith(
      `${path.join(workingDirectory, 'node_modules')}${path.sep}`
    );
    if (isNodeModules) {
      return;
    }
    const source = yield* getSourceCode(
      {
        filePath: absolutePath,
        line: sources.line,
        column: sources.column,
      },
      true
    );

    return MappedSources.sources({
      name,
      runPath: `${location.filePath}:${location.line}:${location.column}`,
      sourcesPath: `${absolutePath}:${sources.line}:${sources.column + 1}`,
      source,
    });
  });

/**
 * Source maps are best-effort metadata. A missing, malformed, invalid, or
 * unreadable map — or a map pointing at an original source that was never
 * shipped — degrades to the raw stack location, and never destroys the
 * diagnostic the user actually asked for. Hence the `never` error channel.
 */
export const getSourcesFromMapFile = (
  name: string,
  location: ErrorLocation
): Effect.Effect<ErrorRelatedSources | RawErrorLocation | undefined, never, FileSystem | Path> =>
  pipe(
    Effect.gen(function* () {
      const path = yield* Path;
      const workingDirectory = path.resolve('.');

      return yield* enrichFromMapFile(name, location, workingDirectory).pipe(
        Effect.orElseSucceed(() => rawErrorLocation(name, location, workingDirectory))
      );
    }),
    Effect.withSpan('get-sources-from-map-file', {
      attributes: { location: JSON.stringify(location) },
    })
  );
