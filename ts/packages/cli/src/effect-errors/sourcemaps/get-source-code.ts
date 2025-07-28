import type { PlatformError } from '@effect/platform/Error';
import { FileSystem } from '@effect/platform/FileSystem';
import { Effect } from 'effect';

import type { ErrorLocation } from './get-error-location-from-file-path';

export interface SourceCode {
  line: number;
  code: string;
  column: number | undefined;
}

const numberOflinesToExtract = 7;

export const getSourceCode = (
  { filePath, line, column }: ErrorLocation,
  isFromJs = false
): Effect.Effect<SourceCode[], PlatformError, FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const sourceCode = yield* fs.readFileString(filePath, 'utf8');

    const start = line >= 4 ? line - 4 : 0;

    return sourceCode
      .split('\n')
      .splice(start, numberOflinesToExtract)
      .map((currentLine, index) => {
        const currentLineNumber = index + start + 1;

        const actualColumn = isFromJs ? column + 1 : column;

        return {
          line: currentLineNumber,
          code: currentLine,
          column: currentLineNumber === line ? actualColumn : undefined,
        };
      });
  });
