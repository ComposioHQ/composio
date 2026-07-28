import type { PlatformError } from '@effect/platform/Error';
import type { FileSystem } from '@effect/platform/FileSystem';
import type { Path } from '@effect/platform/Path';
import { Effect } from 'effect';

import { getErrorLocationFrom } from './get-error-location-from-file-path';
import { getSourceCode } from './get-source-code';
import { getSourcesFromMapFile } from './get-sources-from-map-file';
import { type ErrorRelatedSources, MappedSources, type RawErrorLocation } from './mapped-sources';

export const getErrorRelatedSources = (
  name: string,
  sourceFile: string
): Effect.Effect<
  ErrorRelatedSources | RawErrorLocation | undefined,
  PlatformError,
  FileSystem | Path
> =>
  Effect.gen(function* () {
    const location = getErrorLocationFrom(sourceFile);
    if (location === undefined) {
      return;
    }

    const { filePath, line, column } = location;

    const isTypescriptFile = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    if (isTypescriptFile) {
      const source = yield* getSourceCode(location);

      return MappedSources.sources({
        name,
        runPath: `${filePath}:${line}:${column}`,
        sourcesPath: undefined,
        source,
      });
    }

    return yield* getSourcesFromMapFile(name, location);
  });
