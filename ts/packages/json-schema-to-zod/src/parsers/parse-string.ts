import { z } from 'zod/v3';

import type { JsonSchemaObject } from '../types';
import { extendSchemaWithMessage } from '../utils/extend-schema';

export const parseString = (jsonSchema: JsonSchemaObject & { type: 'string' }) => {
  let zodSchema = z.string();

  zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'format', (zs, format, errorMsg) => {
    switch (format) {
      case 'email':
        return zs.email(errorMsg);
      case 'ip':
        return zs.ip(errorMsg);
      case 'ipv4':
        return zs.ip({ version: 'v4', message: errorMsg });
      case 'ipv6':
        return zs.ip({ version: 'v6', message: errorMsg });
      case 'uri':
        return zs.url(errorMsg);
      case 'uuid':
        return zs.uuid(errorMsg);
      case 'date-time':
        return zs.datetime({ offset: true, message: errorMsg });
      case 'time':
        return zs.time(errorMsg);
      case 'date':
        return zs.date(errorMsg);
      case 'binary':
        return zs.base64(errorMsg);
      case 'duration':
        return zs.duration(errorMsg);
      default:
        return zs;
    }
  });

  zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'contentEncoding', (zs, _, errorMsg) =>
    zs.base64(errorMsg)
  );
  zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'pattern', (zs, pattern, errorMsg) =>
    zs.regex(new RegExp(pattern), errorMsg)
  );
  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'minLength',
    (zs, minLength, errorMsg) => zs.min(minLength, errorMsg)
  );
  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'maxLength',
    (zs, maxLength, errorMsg) => zs.max(maxLength, errorMsg)
  );

  // Handle generic 'min' property as alias for 'minLength'
  if (
    typeof (jsonSchema as unknown as { min?: number }).min === 'number' &&
    typeof jsonSchema.minLength !== 'number'
  ) {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, minLength: (jsonSchema as unknown as { min?: number }).min },
      'minLength',
      (zs, minLength, errorMsg) => zs.min(minLength, errorMsg)
    );
  }

  // Handle generic 'max' property as alias for 'maxLength'
  if (
    typeof (jsonSchema as unknown as { max?: number }).max === 'number' &&
    typeof jsonSchema.maxLength !== 'number'
  ) {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, maxLength: (jsonSchema as unknown as { max?: number }).max },
      'maxLength',
      (zs, maxLength, errorMsg) => zs.max(maxLength, errorMsg)
    );
  }

  return zodSchema;
};
