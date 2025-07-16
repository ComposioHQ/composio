import { z } from 'zod';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, JsonSchema } from '../types';
import { extendSchemaWithMessage } from '../utils/extend-schema';
import { its } from '../utils/its';
import { JSONSchema7TypeName } from 'json-schema';

type MetadataFields =
  | keyof Pick<JsonSchemaObject, 'default' | 'description' | 'title'>
  | 'examples';

export const parseArray = (jsonSchema: JsonSchemaObject & { type: 'array' }, refs: Refs) => {
  // Handle anyOf pattern first
  if (its.an.anyOf(jsonSchema)) {
    const types = new Set<string>();
    const itemsSchemas: JsonSchema[] = [];

    // Collect all types and items from anyOf array
    jsonSchema.anyOf.forEach(option => {
      if (typeof option === 'object' && option.type) {
        types.add(typeof option.type === 'string' ? option.type : option.type[0]);
      }
      if (typeof option === 'object' && option.items) {
        const optionItems = option.items;
        if (!Array.isArray(optionItems) && typeof optionItems === 'object') {
          itemsSchemas.push(optionItems);
        }
      }
    });

    // If we have multiple item schemas, create a union
    let finalItems: JsonSchema | undefined;
    if (itemsSchemas.length === 1) {
      finalItems = itemsSchemas[0];
    } else if (itemsSchemas.length > 1) {
      finalItems = { anyOf: itemsSchemas };
    }

    // Create new schema with combined types
    const newSchema: JsonSchemaObject = {
      ...(types.size > 0
        ? { type: Array.from(types) as JSONSchema7TypeName[] }
        : { type: 'array' }),
      ...(finalItems && { items: finalItems }),
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
