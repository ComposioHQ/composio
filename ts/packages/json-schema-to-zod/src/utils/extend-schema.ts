import type { $ZodType } from 'zod/v4/core';

import type { JsonSchemaObject } from '../types';

export function extendSchemaWithMessage<
  TZod extends $ZodType,
  TJson extends JsonSchemaObject,
  TKey extends keyof TJson,
>(
  zodSchema: TZod,
  jsonSchema: TJson,
  key: TKey,
  extend: (zodSchema: TZod, value: NonNullable<TJson[TKey]>, errorMessage?: string) => TZod
) {
  const value = jsonSchema[key];

  if (value !== undefined) {
    const errorMessage = (jsonSchema as unknown as { errorMessage?: Record<string, string> })
      .errorMessage?.[key as string];
    return extend(zodSchema, value as NonNullable<TJson[TKey]>, errorMessage);
  }

  return zodSchema;
}
