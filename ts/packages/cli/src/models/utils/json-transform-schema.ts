import { ParseResult, Predicate, Schema } from 'effect';

const errorMessage = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

export function JSONTransformSchema<To extends Schema.Schema.Any>(to: To) {
  return Schema.transformOrFail(Schema.String, to, {
    strict: true,
    encode: (obj, _options, ast) =>
      ParseResult.try({
        try: () => JSON.stringify(obj),
        catch: error => new ParseResult.Type(ast, obj, errorMessage(error)),
      }),
    decode: (str, _options, ast) =>
      ParseResult.try({
        try: () => JSON.parse(str),
        catch: error => new ParseResult.Type(ast, str, errorMessage(error)),
      }),
  });
}
