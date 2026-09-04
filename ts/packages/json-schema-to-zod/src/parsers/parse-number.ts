import { z } from 'zod/v3';

import type { JsonSchemaObject } from '../types';
import { extendSchemaWithMessage } from '../utils/extend-schema';

type DecimalInteger = {
  readonly integer: bigint;
  readonly scale: number;
};

const toDecimalInteger = (value: number): DecimalInteger | undefined => {
  if (!Number.isFinite(value)) return undefined;

  const negative = value < 0;
  const [coefficient, exponentText] = Math.abs(value).toString().toLowerCase().split('e');
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole, fraction = ''] = coefficient.split('.');
  let digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  let scale = fraction.length - exponent;

  if (scale < 0) {
    digits += '0'.repeat(-scale);
    scale = 0;
  }

  const integer = BigInt(`${negative ? '-' : ''}${digits}`);
  return { integer, scale };
};

const isJsonMultipleOf = (value: number, multiple: number): boolean => {
  const dividend = toDecimalInteger(value);
  const divisor = toDecimalInteger(multiple);
  if (!dividend || !divisor || divisor.integer === 0n) return false;

  const scale = Math.max(dividend.scale, divisor.scale);
  const scaledDividend = dividend.integer * 10n ** BigInt(scale - dividend.scale);
  const scaledDivisor = divisor.integer * 10n ** BigInt(scale - divisor.scale);
  return scaledDividend % scaledDivisor === 0n;
};

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
  }
  if (typeof jsonSchema.exclusiveMinimum === 'number') {
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
  }
  if (typeof jsonSchema.exclusiveMaximum === 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      jsonSchema,
      'exclusiveMaximum',
      (zs, exclusiveMaximum, errorMsg) => zs.lt(exclusiveMaximum as number, errorMsg)
    );
  }

  // Handle generic 'min' property as alias for 'minimum'
  if (typeof jsonSchema.min === 'number' && typeof jsonSchema.minimum !== 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, minimum: jsonSchema.min },
      'minimum',
      (zs, minimum, errorMsg) => zs.gte(minimum, errorMsg)
    );
  }

  // Handle generic 'max' property as alias for 'maximum'
  if (typeof jsonSchema.max === 'number' && typeof jsonSchema.maximum !== 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, maximum: jsonSchema.max },
      'maximum',
      (zs, maximum, errorMsg) => zs.lte(maximum, errorMsg)
    );
  }

  if (typeof jsonSchema.multipleOf === 'number') {
    const errorMessage = (
      jsonSchema as JsonSchemaObject & { errorMessage?: Record<string, string> }
    ).errorMessage?.multipleOf;
    if (jsonSchema.multipleOf === 1) {
      return isInteger ? zodSchema : zodSchema.int(errorMessage);
    }
    return zodSchema.refine(value => isJsonMultipleOf(value, jsonSchema.multipleOf!), {
      message: errorMessage ?? `Number must be a multiple of ${jsonSchema.multipleOf}`,
    });
  }

  return zodSchema;
};
