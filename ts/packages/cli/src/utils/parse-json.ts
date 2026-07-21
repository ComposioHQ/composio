import { Data, Predicate, Result } from 'effect';
import JSON5 from 'json5';

export class JsonParsingError extends Data.TaggedError('JsonParsingError')<{
  /**
   * `syntax` — the input is not parseable at all;
   * `not-a-record` — valid JSON, but an array/scalar/null instead of an object.
   */
  reason: 'syntax' | 'not-a-record';
  cause: unknown;
}> {}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Predicate.isObject(value) && !Array.isArray(value);

/**
 * Parses JSON or a JS-style object literal (unquoted keys, single quotes,
 * trailing commas, comments) into a record. JSON5 covers the documented
 * "JSON or JS-style object literal" contract without evaluating the input.
 * Inputs that parse to anything other than an object (arrays, scalars,
 * `null`) fail with `JsonParsingError`.
 *
 * Returns a `Result` because parsing is synchronous; `Result` is a subtype
 * of `Effect`, so call sites can `yield*` it or pipe it into Effect
 * combinators directly.
 */
export const parseJsonRecord = (
  raw: string
): Result.Result<Record<string, unknown>, JsonParsingError> =>
  Result.try({
    try: (): unknown => JSON5.parse(raw),
    catch: cause => new JsonParsingError({ reason: 'syntax', cause }),
  }).pipe(
    Result.filterOrFail(
      isPlainRecord,
      parsed =>
        new JsonParsingError({
          reason: 'not-a-record',
          cause: new Error(
            `Expected a JSON object, received ${Array.isArray(parsed) ? 'an array' : typeof parsed}`
          ),
        })
    )
  );
