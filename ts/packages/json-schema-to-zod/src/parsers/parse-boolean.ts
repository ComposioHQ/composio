import type { ParseContext } from '../context';
import type { JsonSchemaObject } from '../types';

export const parseBoolean = <S>(
  _jsonSchema: JsonSchemaObject & { type: 'boolean' },
  ctx: ParseContext<S>
): S => {
  return ctx.backend.boolean();
};
