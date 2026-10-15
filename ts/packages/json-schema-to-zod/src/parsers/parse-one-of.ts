import { parseSchema } from './parse-schema';
import type { RunFailure } from '../backend/types';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';

export const parseOneOf = <S>(
  jsonSchema: JsonSchemaObject & { oneOf: JsonSchema[] },
  ctx: ParseContext<S>
): S => {
  const { backend } = ctx;
  if (!jsonSchema.oneOf.length) {
    return backend.any();
  }

  if (jsonSchema.oneOf.length === 1) {
    return parseSchema(jsonSchema.oneOf[0], {
      ...ctx,
      path: [...ctx.path, 'oneOf', 0],
    });
  }

  return backend.superRefine<unknown>(backend.any(), (x, issues) => {
    const schemas = jsonSchema.oneOf.map((schema, i) =>
      parseSchema(schema, {
        ...ctx,
        path: [...ctx.path, 'oneOf', i],
      })
    );

    const unionErrors = schemas.reduce<RunFailure[]>((errors, schema) => {
      const result = backend.run(schema, x);
      return result.success ? errors : [...errors, result.failure];
    }, []);

    if (schemas.length - unionErrors.length !== 1) {
      issues.invalidUnion('Invalid input: Should pass single schema', unionErrors);
    }
  });
};
