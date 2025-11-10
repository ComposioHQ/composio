import { z, type ZodTypeAny } from './zod-compat';

import { parseSchema } from './parsers/parse-schema';
import type { JsonSchemaToZodOptions, JsonSchema } from './types';

export const jsonSchemaToZod = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): ZodTypeAny => {
  return parseSchema(schema, {
    path: [],
    seen: new Map(),
    ...options,
  });
};
