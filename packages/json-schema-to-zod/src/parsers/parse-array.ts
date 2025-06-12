import { z } from 'zod';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, JsonSchema } from '../types';
import { extendSchemaWithMessage } from '../utils/extend-schema';
import { its } from '../utils/its';

type MetadataFields =
  | keyof Pick<JsonSchemaObject, 'default' | 'description' | 'title'>
  | 'examples';

export const parseArray = (jsonSchema: JsonSchemaObject & { type: 'array' }, refs: Refs) => {
  // Handle anyOf pattern first
  if (its.an.anyOf(jsonSchema)) {
    const types = new Set<string>();
    let items: JsonSchema | undefined;

    // Collect all types and items from anyOf array
    jsonSchema.anyOf.forEach(option => {
      if (typeof option === 'object' && option.type) {
        types.add(typeof option.type === 'string' ? option.type : option.type[0]);
      }
      if (typeof option === 'object' && option.items) {
        const optionItems = option.items;
        if (!Array.isArray(optionItems) && typeof optionItems === 'object') {
          items = optionItems;
        }
      }
    });

    // Create new schema with combined types
    const newSchema: JsonSchemaObject = {
      type: Array.from(types),
      ...(items && { items }),
    };

    // Copy over metadata fields
    const metadataFields: MetadataFields[] = ['default', 'description', 'examples', 'title'];
    metadataFields.forEach(field => {
      const value = jsonSchema[field as keyof typeof jsonSchema];
      if (value !== undefined) {
        (newSchema as { [key in MetadataFields]: unknown })[field] = value;
      }
    });

    return parseSchema(newSchema, refs);
  }

  // Handle regular array schema
  if (Array.isArray(jsonSchema.items)) {
    return z.tuple(
      jsonSchema.items.map((v, i) =>
        parseSchema(v, { ...refs, path: [...refs.path, 'items', i] })
      ) as [z.ZodTypeAny]
    );
  }

  let zodSchema = !jsonSchema.items
    ? z.array(z.any())
    : z.array(parseSchema(jsonSchema.items, { ...refs, path: [...refs.path, 'items'] }));

  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'minItems',
    (zs, minItems, errorMessage) => zs.min(minItems, errorMessage)
  );
  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'maxItems',
    (zs, maxItems, errorMessage) => zs.max(maxItems, errorMessage)
  );

  return zodSchema;
};
