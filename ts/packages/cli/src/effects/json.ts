import { Data, Effect, Schema } from 'effect';

export class JSONParseError extends Data.TaggedError('effects/JSONParseError')<{
  readonly cause: unknown;
  readonly message: string;
}> {}

const JsonRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });

export const JSONParse = (s: string) =>
  Schema.decodeUnknown(Schema.parseJson(JsonRecord))(s).pipe(
    Effect.mapError(cause => new JSONParseError({ cause, message: 'Failed to parse JSON' }))
  );
