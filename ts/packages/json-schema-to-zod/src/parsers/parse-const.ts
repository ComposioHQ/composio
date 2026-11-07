import { parseLiteralValues } from './parse-literal-values';
import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, Serializable } from '../types';

export const parseConst = <S>(
  jsonSchema: JsonSchemaObject & { const: Serializable },
  ctx: ParseContext<S>
): S => {
  const { const: value, ...baseSchema } = jsonSchema;
  return ctx.backend.intersection(
    parseSchema(baseSchema, { ...ctx, seen: new Map(ctx.seen) }, true),
    parseLiteralValues([value], ctx.backend)
  );
};
