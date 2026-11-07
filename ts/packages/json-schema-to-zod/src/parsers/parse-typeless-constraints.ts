import { parseNumber } from './parse-number';
import { parseString } from './parse-string';
import type { ParseContext } from '../context';
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
export const parseTypelessConstraints = <S>(
  schema: JsonSchemaObject,
  ctx: Pick<ParseContext<S>, 'path' | 'backend'>
): S => {
  const { backend } = ctx;
  const stringSchema = parseString({ ...schema, type: 'string' }, ctx);
  const numberSchema = parseNumber({ ...schema, type: 'number' }, backend);

  return backend.superRefine<unknown>(backend.any(), (value, issues) => {
    const applicable =
      typeof value === 'string'
        ? stringSchema
        : typeof value === 'number'
          ? numberSchema
          : undefined;
    if (applicable === undefined) return;

    const result = backend.run(applicable, value);
    if (!result.success) {
      issues.forward(result.failure);
    }
  });
};
