import type { PlatformError } from '@effect/platform/Error';
import type { FileSystem } from '@effect/platform/FileSystem';
import type { Path } from '@effect/platform/Path';
import { Effect, pipe } from 'effect';

import { stackAtRegex } from 'effect-errors/logic/stack';

import { getErrorRelatedSources } from './get-error-related-sources';
import { isRawErrorLocation, MappedSources, type MaybeMappedSources } from './mapped-sources';

export const maybeMapSourcemaps = (
  name: string,
  stacktrace: string[]
): Effect.Effect<MaybeMappedSources[], PlatformError, FileSystem | Path> =>
  pipe(
    Effect.forEach(stacktrace, stackLine =>
      Effect.gen(function* () {
        const chunks = stackLine.trimStart().split(' ');
        const mapFileReportedPath =
          chunks.length === 2 ? chunks[1] : chunks[chunks.length - 1].slice(1, -1);

        const details = yield* getErrorRelatedSources(name, mapFileReportedPath);
        if (details === undefined) {
          return MappedSources['stack-entry']({
            runPath: stackLine.replaceAll(stackAtRegex, 'at '),
          });
        }
        if (isRawErrorLocation(details)) {
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
