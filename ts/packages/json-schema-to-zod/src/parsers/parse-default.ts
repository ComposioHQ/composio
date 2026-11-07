import type { ParseContext } from '../context';
import type { JsonSchemaObject } from '../types';

export const parseDefault = <S>(_jsonSchema: JsonSchemaObject, ctx: ParseContext<S>): S => {
  return ctx.backend.any();
};
