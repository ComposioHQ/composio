import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';

export const parseNot = <S>(
  jsonSchema: JsonSchemaObject & { not: JsonSchema },
  ctx: ParseContext<S>
): S => {
  const { backend } = ctx;
  return backend.refine<unknown>(
    backend.any(),
    value =>
      !backend.run(
        parseSchema(jsonSchema.not, {
          ...ctx,
          path: [...ctx.path, 'not'],
        }),
        value
      ).success,
    'Invalid input: Should NOT be valid against schema'
  );
};
