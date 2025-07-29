import type { PlatformError } from '@effect/platform/Error';
import type { FileSystem } from '@effect/platform/FileSystem';
import { Effect, pipe } from 'effect';

import type { JsonParsingError } from 'effect-errors/dependencies/fs';
import { stackAtRegex } from 'effect-errors/logic/stack';

import { getErrorRelatedSources } from './get-error-related-sources';
import type { ErrorRelatedSources, RawErrorLocation } from './get-sources-from-map-file';

export type StackEntry = {
  _tag: 'stack-entry';
  runPath: string;
};

export type MaybeMappedSources = ErrorRelatedSources | RawErrorLocation | StackEntry;

export const maybeMapSourcemaps = (
  name: string,
  stacktrace: string[]
): Effect.Effect<MaybeMappedSources[], PlatformError | JsonParsingError, FileSystem> =>
  pipe(
    Effect.forEach(stacktrace, stackLine =>
      Effect.gen(function* () {
        const chunks = stackLine.trimStart().split(' ');
        const mapFileReportedPath =
          chunks.length === 2 ? chunks[1] : chunks[chunks.length - 1].slice(1, -1);

        const details = yield* getErrorRelatedSources(name, mapFileReportedPath);
        if (details === undefined) {
          return {
            _tag: 'stack-entry' as const,
            runPath: stackLine.replaceAll(stackAtRegex, 'at '),
          };
        }
        if (details._tag === 'location') {
          return details;
        }

        const regex = new RegExp(`${process.cwd()}/node_modules/`);
        if (details.sourcesPath?.match(regex)) {
          return undefined;
        }

        return details;
      })
    ),
    Effect.map(array => array.filter(maybeSources => maybeSources !== undefined))
  );
