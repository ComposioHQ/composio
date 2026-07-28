import type { PlatformError } from '@effect/platform/Error';
import { FileSystem } from '@effect/platform/FileSystem';
import { Path } from '@effect/platform/Path';
import { Data, Effect, Option, Schema, pipe } from 'effect';
import { SourceMapConsumer } from 'source-map-js';

import { readJsonEffect } from 'effect-errors/dependencies/fs';

import type { ErrorLocation } from './get-error-location-from-file-path';
import { getSourceCode, type SourceCode } from './get-source-code';

const SourceMapVersionSchema = Schema.Literal(3, '3').pipe(
  Schema.transform(Schema.Literal('3'), {
    strict: true,
    decode: (): '3' => '3',
    encode: version => version,
  })
);
const MutableStringsSchema = Schema.mutable(Schema.Array(Schema.String));
const RawSourceMapSchema = Schema.Struct({
  version: SourceMapVersionSchema,
  sources: MutableStringsSchema,
  names: Schema.optionalWith(MutableStringsSchema, { default: () => [] }),
  mappings: Schema.String,
  file: Schema.optional(Schema.String),
  sourceRoot: Schema.optional(Schema.String),
});
const decodeRawSourceMap = Schema.decodeUnknownOption(RawSourceMapSchema);

class SourceMapResolutionError extends Data.TaggedError('SourceMapResolutionError')<{
  readonly filePath: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Could not resolve source-map location for ${this.filePath}`;
  }
}

export interface ErrorRelatedSources {
  _tag: 'sources';
  name: string;
  source: SourceCode[];
  runPath: string;
  sourcesPath: string | undefined;
}

export interface RawErrorLocation extends ErrorLocation {
  _tag: 'location';
  name: string;
}

const rawErrorLocation = (
  name: string,
  location: ErrorLocation,
  workingDirectory: string
): RawErrorLocation => ({
  _tag: 'location',
  name,
  ...location,
  filePath: location.filePath.replace(workingDirectory, ''),
});

const resolveOriginalPosition = (
  sourceMap: typeof RawSourceMapSchema.Type,
  location: ErrorLocation
) =>
  Effect.try({
    try: () =>
      new SourceMapConsumer(sourceMap).originalPositionFor({
        column: location.column,
        line: location.line,
      }),
    catch: cause => new SourceMapResolutionError({ filePath: location.filePath, cause }),
  }).pipe(
    Effect.map(Option.some),
    Effect.catchTag('SourceMapResolutionError', () => Effect.succeed(Option.none()))
  );

export const getSourcesFromMapFile = (
  name: string,
  location: ErrorLocation
): Effect.Effect<
  ErrorRelatedSources | RawErrorLocation | undefined,
  PlatformError,
  FileSystem | Path
> =>
  pipe(
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const path = yield* Path;
      const workingDirectory = path.resolve('.');
      const fileExists = yield* fs.exists(`${location.filePath}.map`);
      if (!fileExists) {
        return rawErrorLocation(name, location, workingDirectory);
      }

      const sourceMap = yield* readJsonEffect(`${location.filePath}.map`).pipe(
        Effect.map(Option.fromNullable),
        Effect.map(Option.flatMap(decodeRawSourceMap)),
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

      return {
        _tag: 'sources' as const,
        name,
        runPath: `${location.filePath}:${location.line}:${location.column}`,
        sourcesPath: `${absolutePath}:${sources.line}:${sources.column + 1}`,
        source,
      };
    }),
    Effect.withSpan('get-sources-from-map-file', {
      attributes: { location: JSON.stringify(location) },
    })
  );
