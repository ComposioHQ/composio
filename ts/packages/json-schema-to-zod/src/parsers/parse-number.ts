import * as z from 'zod';

import type { JsonSchemaObject } from '../types';
import { extendSchemaWithMessage } from '../utils/extend-schema';

export const parseNumber = (jsonSchema: JsonSchemaObject & { type: 'number' | 'integer' }) => {
  let zodSchema = z.number();

  let isInteger = false;
  if (jsonSchema.type === 'integer') {
    isInteger = true;
    zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'type', (zs, _, errorMsg) =>
      zs.int(errorMsg)
    );
  } else if (jsonSchema.format === 'int64') {
    isInteger = true;
    zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'format', (zs, _, errorMsg) =>
      zs.int(errorMsg)
    );
  }

  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'multipleOf',
    (zs, multipleOf, errorMsg) => {
      if (multipleOf === 1) {
        if (isInteger) return zs;

        return zs.int(errorMsg);
      }

      return zs.multipleOf(multipleOf, errorMsg);
    }
  );

  if (typeof jsonSchema.minimum === 'number') {
    if ((jsonSchema as unknown as { exclusiveMinimum?: boolean }).exclusiveMinimum === true) {
      zodSchema = extendSchemaWithMessage(
        zodSchema,
        jsonSchema,
        'minimum',
        (zs, minimum, errorMsg) => zs.gt(minimum, errorMsg)
      );
    } else {
      zodSchema = extendSchemaWithMessage(
        zodSchema,
        jsonSchema,
        'minimum',
        (zs, minimum, errorMsg) => zs.gte(minimum, errorMsg)
      );
    }
  } else if (typeof jsonSchema.exclusiveMinimum === 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      jsonSchema,
      'exclusiveMinimum',
      (zs, exclusiveMinimum, errorMsg) => zs.gt(exclusiveMinimum as number, errorMsg)
    );
  }

  if (typeof jsonSchema.maximum === 'number') {
    if ((jsonSchema as unknown as { exclusiveMaximum?: boolean }).exclusiveMaximum === true) {
      zodSchema = extendSchemaWithMessage(
        zodSchema,
        jsonSchema,
        'maximum',
        (zs, maximum, errorMsg) => zs.lt(maximum, errorMsg)
      );
    } else {
      zodSchema = extendSchemaWithMessage(
        zodSchema,
        jsonSchema,
        'maximum',
        (zs, maximum, errorMsg) => zs.lte(maximum, errorMsg)
      );
    }
  } else if (typeof jsonSchema.exclusiveMaximum === 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      jsonSchema,
      'exclusiveMaximum',
      (zs, exclusiveMaximum, errorMsg) => zs.lt(exclusiveMaximum as number, errorMsg)
    );
  }

  // Handle generic 'min' property as alias for 'minimum'
  if (
    typeof (jsonSchema as unknown as { min?: number }).min === 'number' &&
    typeof jsonSchema.minimum !== 'number'
  ) {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, minimum: (jsonSchema as unknown as { min?: number }).min },
      'minimum',
      (zs, minimum, errorMsg) => zs.gte(minimum, errorMsg)
    );
  }

  // Handle generic 'max' property as alias for 'maximum'
  if (
    typeof (jsonSchema as unknown as { max?: number }).max === 'number' &&
    typeof jsonSchema.maximum !== 'number'
  ) {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, maximum: (jsonSchema as unknown as { max?: number }).max },
      'maximum',
      (zs, maximum, errorMsg) => zs.lte(maximum, errorMsg)
    );
  }

  return zodSchema;
};
