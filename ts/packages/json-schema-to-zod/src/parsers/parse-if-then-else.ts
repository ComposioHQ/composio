import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';

export const parseIfThenElse = <S>(
  jsonSchema: JsonSchemaObject & {
    if: JsonSchema;
    then: JsonSchema;
    else: JsonSchema;
  },
  ctx: ParseContext<S>
): S => {
  const { backend } = ctx;
  const $if = parseSchema(jsonSchema.if, { ...ctx, path: [...ctx.path, 'if'] });
  const $then = parseSchema(jsonSchema.then, {
    ...ctx,
    path: [...ctx.path, 'then'],
  });
  const $else = parseSchema(jsonSchema.else, {
    ...ctx,
    path: [...ctx.path, 'else'],
  });

  return backend.superRefine<unknown>(backend.union([$then, $else]), (value, issues) => {
    const result = backend.run($if, value).success
      ? backend.run($then, value)
      : backend.run($else, value);

    if (!result.success) {
      issues.forward(result.failure);
    }
  });
};
