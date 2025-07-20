import { Schema, ParseResult } from 'effect';

export function JSONTransformSchema<To extends Schema.Schema.Any>(to: To) {
  return Schema.transformOrFail(Schema.String, to, {
    strict: true,
    encode: (obj, _options, ast) =>
      ParseResult.try({
        try: () => JSON.stringify(obj),
        catch: e => new ParseResult.Type(ast, obj, (e as Error).message),
      }),
    decode: (str, _options, ast) =>
      ParseResult.try({
        try: () => JSON.parse(str),
        catch: e => new ParseResult.Type(ast, str, (e as Error).message),
      }),
  });
}
