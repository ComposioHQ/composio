import { parse } from 'comment-json';
import { Effect, pipe } from 'effect';

import { JsonParsingError } from './json-parsing.error';

export const parseJson = (data: string) =>
  pipe(
    Effect.sync(() => parse(data, null, true)),
    Effect.catchAll(e =>
      Effect.fail(
        new JsonParsingError({
          cause: e,
        })
      )
    ),
    Effect.withSpan('parse-json', {
      attributes: {
        data,
      },
    })
  );
