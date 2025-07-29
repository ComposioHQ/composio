import { FileSystem } from '@effect/platform/FileSystem';
import { Effect, pipe } from 'effect';

import { parseJson } from './parse-json';

export const readJsonEffect = <TJson>(filePath: string) =>
  pipe(
    Effect.gen(function* () {
      const { readFileString } = yield* FileSystem;
      const data = yield* readFileString(filePath, 'utf8');

      if (data.length === 0) {
        return null;
      }

      const json = yield* parseJson(data);

      return json as TJson;
    }),
    Effect.withSpan('read-json', { attributes: { filePath } })
  );
