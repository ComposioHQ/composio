import type { z } from 'zod/v3';

import { parseSchema } from './parsers/parse-schema';
import type { JsonSchemaToZodOptions, JsonSchema } from './types';

export const jsonSchemaToZod = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): z.ZodType => {
  return parseSchema(schema, {
    path: [],
    seen: new Map(),
    ...options,
  });
};
