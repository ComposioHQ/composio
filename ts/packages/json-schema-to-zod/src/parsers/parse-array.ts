import { z } from 'zod/v3';

import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, JsonSchema } from '../types';
import { extendSchemaWithMessage } from '../utils/extend-schema';
import { its } from '../utils/its';
import type { JSONSchema7TypeName } from 'json-schema';

type MetadataFields =
  keyof Pick<JsonSchemaObject, 'default' | 'description' | 'title'> | 'examples';

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
    const parsedItems = jsonSchema.items.map((item, index) =>
      parseSchema(item, { ...refs, path: [...refs.path, 'items', index] })
    );
    const prefixSchemas = parsedItems.map((_, length) =>
      z.tuple(parsedItems.slice(0, length) as unknown as [z.ZodTypeAny])
    );
    const fullTuple = z.tuple(parsedItems as unknown as [z.ZodTypeAny]);

    let fullLengthSchema: z.ZodTypeAny;
    if (jsonSchema.additionalItems === false) {
      fullLengthSchema = fullTuple;
    } else if (jsonSchema.additionalItems && jsonSchema.additionalItems !== true) {
      fullLengthSchema = fullTuple.rest(
        parseSchema(jsonSchema.additionalItems, {
          ...refs,
          path: [...refs.path, 'additionalItems'],
        })
      );
    } else {
      fullLengthSchema = fullTuple.rest(z.any());
    }

    const variants = [...prefixSchemas, fullLengthSchema];
    let tupleSchema: z.ZodTypeAny =
      variants.length === 1
        ? variants[0]
        : z.union(variants as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);

    if (typeof jsonSchema.minItems === 'number') {
      tupleSchema = tupleSchema.refine(value => value.length >= jsonSchema.minItems!, {
        message: `Array must contain at least ${jsonSchema.minItems} element(s)`,
      });
    }
    if (typeof jsonSchema.maxItems === 'number') {
      tupleSchema = tupleSchema.refine(value => value.length <= jsonSchema.maxItems!, {
        message: `Array must contain at most ${jsonSchema.maxItems} element(s)`,
      });
    }

    return tupleSchema;
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

  // Handle generic 'min' property as alias for 'minItems'
  if (typeof jsonSchema.min === 'number' && typeof jsonSchema.minItems !== 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, minItems: jsonSchema.min },
      'minItems',
      (zs, minItems, errorMessage) => zs.min(minItems, errorMessage)
    );
  }

  // Handle generic 'max' property as alias for 'maxItems'
  if (typeof jsonSchema.max === 'number' && typeof jsonSchema.maxItems !== 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, maxItems: jsonSchema.max },
      'maxItems',
      (zs, maxItems, errorMessage) => zs.max(maxItems, errorMessage)
    );
  }

  return zodSchema;
};
