import { z } from 'zod/v3';

import type { JsonSchemaObject } from '../types';

export const parseBoolean = (_jsonSchema: JsonSchemaObject & { type: 'boolean' }) => {
  return z.boolean();
};
