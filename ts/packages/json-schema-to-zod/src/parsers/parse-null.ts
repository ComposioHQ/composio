import { z } from '../zod-compat';

import type { JsonSchemaObject } from '../types';

export const parseNull = (_jsonSchema: JsonSchemaObject & { type: 'null' }) => {
  return z.null();
};
