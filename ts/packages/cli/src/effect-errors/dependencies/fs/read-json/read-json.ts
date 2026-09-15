import { FileSystem } from 'effect/FileSystem';
import { Effect, pipe } from 'effect';

import { parseJsonRecord } from 'src/utils/parse-json';

export const readJsonEffect = (filePath: string) =>
  pipe(
    Effect.gen(function* () {
      const { readFileString } = yield* FileSystem;
      const data = yield* readFileString(filePath, 'utf8');

      if (data.length === 0) {
        return null;
      }

      const json = yield* Effect.fromResult(parseJsonRecord(data));

      return json;
    }),
    Effect.withSpan('read-json', { attributes: { filePath } })
  );
