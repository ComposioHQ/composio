import { Effect, Option, Predicate, Schema, SchemaGetter, SchemaIssue } from 'effect';

const errorMessage = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

export function JSONTransformSchema<To extends Schema.Top>(to: To) {
  return Schema.String.pipe(
    Schema.decodeTo(to, {
      decode: SchemaGetter.transformOrFail((str: string) =>
        Effect.try({
          try: (): To['Encoded'] => JSON.parse(str),
          catch: error =>
            new SchemaIssue.InvalidValue(Option.some(str), { message: errorMessage(error) }),
        })
      ),
      encode: SchemaGetter.transformOrFail((obj: To['Encoded']) =>
        Effect.try({
          try: () => JSON.stringify(obj),
          catch: error =>
            new SchemaIssue.InvalidValue(Option.some(obj), { message: errorMessage(error) }),
        })
      ),
    })
  );
}
