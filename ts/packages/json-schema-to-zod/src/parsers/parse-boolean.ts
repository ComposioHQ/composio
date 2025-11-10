import { z } from '../zod-compat';

import type { JsonSchemaObject } from '../types';

export const parseBoolean = (_jsonSchema: JsonSchemaObject & { type: 'boolean' }) => {
  return z.boolean();
};
