import type { ParseContext } from '../context';
import type { JsonSchemaObject } from '../types';

export const parseNull = <S>(
  _jsonSchema: JsonSchemaObject & { type: 'null' },
  ctx: ParseContext<S>
): S => {
  return ctx.backend.null();
};
