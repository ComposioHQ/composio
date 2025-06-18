import { Data, Effect } from 'effect';

export class JSONParseError extends Data.TaggedError('effects/JSONParseError')<{
  readonly cause: Error;
  readonly message: string;
}> {}

export const JSONParse = (s: string) =>
  Effect.try({
    try: () => JSON.parse(s) as Record<string, unknown>,
    catch: e => new JSONParseError({ cause: e as Error, message: 'Failed to parse JSON' }),
  });
