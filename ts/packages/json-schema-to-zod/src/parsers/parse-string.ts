import { z } from 'zod/v3';

// JSON Schema's `time` format is an RFC 3339 `full-time`, which always carries
// a UTC offset (`Z` or `±hh:mm`). Zod's `.time()` rejects offsets entirely, so
// it both rejects valid times (`10:30:00Z`) and accepts invalid ones (`10:30`).
const RFC3339_FULL_TIME =
  /^([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?([zZ]|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

import type { JsonSchemaObject, Refs } from '../types';
import { compilePattern } from '../utils/compile-pattern';
import { extendSchemaWithMessage } from '../utils/extend-schema';

export const parseString = (
  jsonSchema: JsonSchemaObject & { type: 'string' },
  refs: Pick<Refs, 'path'>
) => {
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
        return zs.regex(RFC3339_FULL_TIME, errorMsg);
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
    zs.regex(compilePattern('pattern', pattern, refs), errorMsg)
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
  if (jsonSchema.format === 'time') {
    result = result.refine(hasValidLeapSecond, {
      message: errorMessages?.format ?? 'Invalid time',
    });
  }

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

// RFC 3339 section 5.7: a leap second occurs at 23:59 UTC and shifts with
// the offset. A time-only value has no date, so only the UTC minute can
// be checked, not whether a leap second was announced for a given day.
const hasValidLeapSecond = (value: string): boolean => {
  if (value.slice(6, 8) !== '60') return true;
  if (!RFC3339_FULL_TIME.test(value)) return false;

  const localMinutes = Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(value);
  const offsetMinutes = offset
    ? (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3]))
    : 0;
  const utcMinutes = (((localMinutes - offsetMinutes) % 1440) + 1440) % 1440;
  return utcMinutes === 1439;
};
