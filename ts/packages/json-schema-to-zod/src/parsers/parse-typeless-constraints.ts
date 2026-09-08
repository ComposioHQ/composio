import { z } from 'zod/v3';

import { parseNumber } from './parse-number';
import { parseString } from './parse-string';
import type { JsonSchemaObject } from '../types';

const SCALAR_CONSTRAINT_KEYS = [
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
] as const;

export const hasTypelessScalarConstraints = (schema: JsonSchemaObject): boolean =>
  schema.type === undefined && SCALAR_CONSTRAINT_KEYS.some(key => schema[key] !== undefined);

/**
 * Draft 7 applies scalar constraints to matching instance types even when the
 * schema declares no `type`: `{ "minLength": 2 }` restricts strings while
 * leaving every non-string value untouched.
 */
export const parseTypelessConstraints = (schema: JsonSchemaObject): z.ZodTypeAny => {
  const stringSchema = parseString({ ...schema, type: 'string' });
  const numberSchema = parseNumber({ ...schema, type: 'number' });

  return z.any().superRefine((value, ctx) => {
    const applicable =
      typeof value === 'string'
        ? stringSchema
        : typeof value === 'number'
          ? numberSchema
          : undefined;
    if (applicable === undefined) return;

    const result = applicable.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue(issue);
      }
    }
  });
};
