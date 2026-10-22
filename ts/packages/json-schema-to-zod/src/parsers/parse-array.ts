import { parseSchema } from './parse-schema';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';
import { extendSchemaWithMessage } from '../utils/extend-schema';
import { its } from '../utils/its';
import type { JSONSchema7TypeName } from 'json-schema';

type MetadataFields =
  keyof Pick<JsonSchemaObject, 'default' | 'description' | 'title'> | 'examples';

export const parseArray = <S>(
  jsonSchema: JsonSchemaObject & { type: 'array' },
  ctx: ParseContext<S>
): S => {
  const { backend } = ctx;

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

    return parseSchema(newSchema, ctx);
  }

  // Handle regular array schema
  if (Array.isArray(jsonSchema.items)) {
    const parsedItems = jsonSchema.items.map((item, index) =>
      parseSchema(item, { ...ctx, path: [...ctx.path, 'items', index] })
    );
    const prefixSchemas = parsedItems.map((_, length) =>
      backend.tuple(parsedItems.slice(0, length), undefined)
    );

    let fullLengthSchema: S;
    if (jsonSchema.additionalItems === false) {
      fullLengthSchema = backend.tuple(parsedItems, undefined);
    } else if (jsonSchema.additionalItems && jsonSchema.additionalItems !== true) {
      fullLengthSchema = backend.tuple(
        parsedItems,
        parseSchema(jsonSchema.additionalItems, {
          ...ctx,
          path: [...ctx.path, 'additionalItems'],
        })
      );
    } else {
      fullLengthSchema = backend.tuple(parsedItems, backend.any());
    }

    const variants = [...prefixSchemas, fullLengthSchema];
    let tupleSchema: S =
      variants.length === 1 ? variants[0] : backend.union(variants as unknown as [S, S, ...S[]]);

    if (typeof jsonSchema.minItems === 'number') {
      tupleSchema = backend.refine<unknown[]>(
        tupleSchema,
        value => value.length >= jsonSchema.minItems!,
        `Array must contain at least ${jsonSchema.minItems} element(s)`
      );
    }
    if (typeof jsonSchema.maxItems === 'number') {
      tupleSchema = backend.refine<unknown[]>(
        tupleSchema,
        value => value.length <= jsonSchema.maxItems!,
        `Array must contain at most ${jsonSchema.maxItems} element(s)`
      );
    }

    return tupleSchema;
  }

  let zodSchema = !jsonSchema.items
    ? backend.array(backend.any())
    : backend.array(parseSchema(jsonSchema.items, { ...ctx, path: [...ctx.path, 'items'] }));

  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'minItems',
    (zs, minItems, errorMessage) => backend.minItems(zs, minItems, errorMessage)
  );
  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'maxItems',
    (zs, maxItems, errorMessage) => backend.maxItems(zs, maxItems, errorMessage)
  );

  // Handle generic 'min' property as alias for 'minItems'
  if (typeof jsonSchema.min === 'number' && typeof jsonSchema.minItems !== 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, minItems: jsonSchema.min },
      'minItems',
      (zs, minItems, errorMessage) => backend.minItems(zs, minItems, errorMessage)
    );
  }

  // Handle generic 'max' property as alias for 'maxItems'
  if (typeof jsonSchema.max === 'number' && typeof jsonSchema.maxItems !== 'number') {
    zodSchema = extendSchemaWithMessage(
      zodSchema,
      { ...jsonSchema, maxItems: jsonSchema.max },
      'maxItems',
      (zs, maxItems, errorMessage) => backend.maxItems(zs, maxItems, errorMessage)
    );
  }

  return zodSchema;
};
