import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';

export const parseAnyOf = <S>(
  jsonSchema: JsonSchemaObject & { anyOf: JsonSchema[] },
  ctx: ParseContext<S>
): S => {
  return jsonSchema.anyOf.length
    ? jsonSchema.anyOf.length === 1
      ? parseSchema(jsonSchema.anyOf[0], {
          ...ctx,
          path: [...ctx.path, 'anyOf', 0],
        })
      : ctx.backend.union(
          jsonSchema.anyOf.map((schema, i) =>
            parseSchema(schema, { ...ctx, path: [...ctx.path, 'anyOf', i] })
          ) as [S, S]
        )
    : ctx.backend.any();
};
