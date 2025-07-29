import path from 'node:path';

import type { PlatformError } from '@effect/platform/Error';
import { FileSystem } from '@effect/platform/FileSystem';
import { Effect, pipe } from 'effect';
import { type RawSourceMap, SourceMapConsumer } from 'source-map-js';

import { type JsonParsingError, readJsonEffect } from 'effect-errors/dependencies/fs';

import type { ErrorLocation } from './get-error-location-from-file-path';
import { getSourceCode, type SourceCode } from './get-source-code';

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

export const getSourcesFromMapFile = (
  name: string,
  location: ErrorLocation
): Effect.Effect<
  ErrorRelatedSources | RawErrorLocation | undefined,
  PlatformError | JsonParsingError,
  FileSystem
> =>
  pipe(
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const fileExists = yield* fs.exists(`${location.filePath}.map`);
      if (!fileExists) {
        return {
          _tag: 'location' as const,
          name,
          ...location,
          filePath: location.filePath.replace(process.cwd(), ''),
        };
      }

      const data = yield* readJsonEffect<RawSourceMap>(`${location.filePath}.map`);
      const hasNoData = data?.version === undefined || data?.sources === undefined;
      if (hasNoData) {
        return;
      }

      const consumer = new SourceMapConsumer(data);
      const sources = consumer.originalPositionFor({
        column: location.column,
        line: location.line,
      });
      if (sources.source === null || sources.line === null || sources.column === null) {
        return;
      }

      const absolutePath = path.resolve(
        location.filePath.substring(0, location.filePath.lastIndexOf('/')),
        sources.source
      );
      const isNodeModules = absolutePath.startsWith(`${process.cwd()}/node_modules`);
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
