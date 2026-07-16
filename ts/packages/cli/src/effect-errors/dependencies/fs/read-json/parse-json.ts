import { parse } from 'comment-json';
import { Effect, pipe } from 'effect';

import { JsonParsingError } from './json-parsing.error';

export const parseJson = (data: string) =>
  pipe(
    Effect.try({
      try: () => parse(data, null, true),
      catch: cause => new JsonParsingError({ cause }),
    }),
    Effect.withSpan('parse-json', {
      attributes: {
        data,
      },
    })
  );
