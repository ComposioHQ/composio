import { z, z3 } from '../zod-compat';

import type { JsonSchemaObject, Serializable } from '../types';

export const parseConst = (jsonSchema: JsonSchemaObject & { const: Serializable }) => {
  return z.literal(jsonSchema.const as z3.Primitive);
};
