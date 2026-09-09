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
  // JSON Schema length constraints count Unicode code points, while Zod's
  // built-in `.min()`/`.max()` count UTF-16 code units and overcount astral
  // glyphs, so both bounds are applied as code-point refinements.
  const errorMessages = (jsonSchema as { errorMessage?: Record<string, string> }).errorMessage;
  // 'min'/'max' are generic aliases for 'minLength'/'maxLength'
  const minLength =
    typeof jsonSchema.minLength === 'number'
      ? jsonSchema.minLength
      : typeof jsonSchema.min === 'number'
        ? jsonSchema.min
        : undefined;
  const maxLength =
    typeof jsonSchema.maxLength === 'number'
      ? jsonSchema.maxLength
      : typeof jsonSchema.max === 'number'
        ? jsonSchema.max
        : undefined;

  let result: z.ZodTypeAny = zodSchema;
  if (minLength !== undefined) {
    result = result.refine(value => codePointLength(value) >= minLength, {
      message: errorMessages?.minLength ?? `String must contain at least ${minLength} character(s)`,
    });
  }
  if (maxLength !== undefined) {
    result = result.refine(value => codePointLength(value) <= maxLength, {
      message: errorMessages?.maxLength ?? `String must contain at most ${maxLength} character(s)`,
    });
  }

  return result;
};

const codePointLength = (value: string): number => [...value].length;
