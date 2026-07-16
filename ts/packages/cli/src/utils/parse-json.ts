import { Data, Either, Predicate } from 'effect';
import JSON5 from 'json5';

export class JsonParsingError extends Data.TaggedError('JsonParsingError')<{
  /**
   * `syntax` — the input is not parseable at all;
   * `not-a-record` — valid JSON, but an array/scalar/null instead of an object.
   */
  reason: 'syntax' | 'not-a-record';
  cause: unknown;
}> {}

/**
 * Parses JSON or a JS-style object literal (unquoted keys, single quotes,
 * trailing commas, comments) into a record. JSON5 covers the documented
 * "JSON or JS-style object literal" contract without evaluating the input.
 * Inputs that parse to anything other than an object (arrays, scalars,
 * `null`) fail with `JsonParsingError`.
 *
 * Returns an `Either` because parsing is synchronous; `Either` is a subtype
 * of `Effect`, so call sites can `yield*` it or pipe it into Effect
 * combinators directly.
 */
export const parseJsonRecord = (
  raw: string
): Either.Either<Record<string, unknown>, JsonParsingError> =>
  Either.try({
    try: (): unknown => JSON5.parse(raw),
    catch: cause => new JsonParsingError({ reason: 'syntax', cause }),
  }).pipe(
    Either.filterOrLeft(
      Predicate.isRecord,
      parsed =>
        new JsonParsingError({
          reason: 'not-a-record',
          cause: new Error(
            `Expected a JSON object, received ${Array.isArray(parsed) ? 'an array' : typeof parsed}`
          ),
        })
    )
  );
