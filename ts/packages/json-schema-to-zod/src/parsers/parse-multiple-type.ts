import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchema, JsonSchemaObject } from '../types';

export const parseMultipleType = <S>(
  jsonSchema: JsonSchemaObject & { type: string[] },
  ctx: ParseContext<S>
): S => {
  return ctx.backend.union(
    jsonSchema.type.map(type => parseSchema({ ...jsonSchema, type } as JsonSchema, ctx)) as [S, S]
  );
};
