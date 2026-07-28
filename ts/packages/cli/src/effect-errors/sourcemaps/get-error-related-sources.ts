import { FileSystem } from '@effect/platform/FileSystem';
import { Path } from '@effect/platform/Path';
import { Effect } from 'effect';

import { getErrorLocationFrom } from './get-error-location-from-file-path';
import { getSourceCode } from './get-source-code';
import { getSourcesFromMapFile } from './get-sources-from-map-file';
import { type ErrorRelatedSources, MappedSources, type RawErrorLocation } from './mapped-sources';

export const getErrorRelatedSources = (
  name: string,
  sourceFile: string
): Effect.Effect<ErrorRelatedSources | RawErrorLocation | undefined, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const location = getErrorLocationFrom(sourceFile);
    if (location === undefined) {
      return;
    }

    const { filePath, line, column } = location;

    const isTypescriptFile = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    if (isTypescriptFile) {
      const path = yield* Path;
      const workingDirectory = path.resolve('.');

      // Reading the source is best-effort enrichment, exactly as it is for the
      // source-map branch below: an unreadable file falls back to the location.
      return yield* getSourceCode(location).pipe(
        Effect.map(source =>
          MappedSources.sources({
            name,
            runPath: `${filePath}:${line}:${column}`,
            sourcesPath: undefined,
            source,
          })
        ),
        Effect.orElseSucceed(() =>
          MappedSources.location({
            name,
            ...location,
            filePath: filePath.replace(workingDirectory, ''),
          })
        )
      );
    }

    return yield* getSourcesFromMapFile(name, location);
  });
