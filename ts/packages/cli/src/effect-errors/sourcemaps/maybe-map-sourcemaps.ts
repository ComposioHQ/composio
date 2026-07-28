import type { FileSystem } from '@effect/platform/FileSystem';
import type { Path } from '@effect/platform/Path';
import { Effect } from 'effect';

import { stackAtRegex } from 'effect-errors/logic/stack';

import { getErrorRelatedSources } from './get-error-related-sources';
import { MappedSources, type MaybeMappedSources } from './mapped-sources';

export const maybeMapSourcemaps = (
  name: string,
  stacktrace: string[]
): Effect.Effect<MaybeMappedSources[], never, FileSystem | Path> =>
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

      // `node_modules` frames are already dropped by `getSourcesFromMapFile`,
      // which compares resolved paths through the `Path` service instead of
      // interpolating the working directory into an unescaped `RegExp`.
      return details;
    })
  );
