import { Data, Effect, Schema } from 'effect';

export class JSONParseError extends Data.TaggedError('effects/JSONParseError')<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/**
 * The canonical "JSON object" schema: a string-keyed record of unknown values.
 * Import this instead of re-declaring `Schema.Record({ key: Schema.String,
 * value: Schema.Unknown })` locally.
 */
export const JsonRecordSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown });

export const JSONParse = (s: string) =>
  Schema.decodeUnknown(Schema.parseJson(JsonRecordSchema))(s).pipe(
    Effect.mapError(cause => new JSONParseError({ cause, message: 'Failed to parse JSON' }))
  );
