import { parseLiteralValues } from './parse-literal-values';
import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, Serializable } from '../types';

export const parseEnum = <S>(
  jsonSchema: JsonSchemaObject & { enum: Serializable[] },
  ctx: ParseContext<S>
): S => {
  const { enum: values, ...baseSchema } = jsonSchema;
  return ctx.backend.intersection(
    parseSchema(baseSchema, { ...ctx, seen: new Map(ctx.seen) }, true),
    parseLiteralValues(values, ctx.backend)
  );
};
