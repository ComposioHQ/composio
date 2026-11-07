import type { ZodBackend } from './backend/types';
import type { OptionsOf, ParseContext } from './context';
import { parseObjectShape } from './parsers/parse-object-shape';
import { parseSchema } from './parsers/parse-schema';
import type { JsonSchema, JsonSchemaObject } from './types';
import { createWholeSchemaGuard, requiresWholeSchemaValidation } from './whole-schema-validation';

type ConverterOptions<S> = OptionsOf<S> & { withoutAnnotations?: boolean };

/** The two conversion entry points, bound to one backend. */
export const createConverter = <S>(backend: ZodBackend<S>) => {
  const contextFor = (root: JsonSchema, options: ConverterOptions<S>): ParseContext<S> => ({
    path: [],
    seen: new Map(),
    root,
    ...options,
    backend,
  });

  const jsonSchemaToZod = (schema: JsonSchema, options: ConverterOptions<S> = {}): S => {
    const parsedSchema = parseSchema(schema, contextFor(schema, options));

    return requiresWholeSchemaValidation(schema)
      ? backend.attachGuard(parsedSchema, createWholeSchemaGuard(schema))
      : parsedSchema;
  };

  const jsonSchemaToZodShape = (
    schema: JsonSchema,
    options: ConverterOptions<S> = {}
  ): Record<string, S> => {
    if (typeof schema !== 'object' || schema === null) {
      return {};
    }

    const objectSchema = schema as JsonSchemaObject;

    return parseObjectShape(objectSchema, contextFor(objectSchema, options));
  };

  return { jsonSchemaToZod, jsonSchemaToZodShape };
};
