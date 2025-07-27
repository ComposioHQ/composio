import * as ts from '@composio/ts-builders';
import type { JsonSchemaObject, Refs, TypeDeclarationResult } from '../types';
import { parseSchema } from './parse-schema';

export function parseObject(schema: JsonSchemaObject, refs: Refs): TypeDeclarationResult {
  if (!schema.properties || typeof schema.properties !== 'object') {
    // Return Record<string, unknown> for objects without properties
    return {
      type: ts
        .namedType('Record')
        .addGenericArgument(ts.stringType)
        .addGenericArgument(ts.unknownType),
      declarations: [],
    };
  }

  const properties = schema.properties as Record<string, JsonSchemaObject>;
  const required = (schema.required as string[]) || [];
  const objectProperties: Array<ts.Property | ts.IndexSignature> = [];
  const allDeclarations: Array<
    | {
        name: string;
        type: ts.TypeBuilder;
        description?: string;
      }
    | ts.TypeDeclaration
  > = [];

  // Process each property
  for (const [propName, propSchema] of Object.entries(properties)) {
    const isRequired = required.includes(propName);

    const result = parseSchema(propSchema, {
      ...refs,
      path: [...refs.path, 'properties', propName],
    });

    // Add any helper type declarations
    allDeclarations.push(...result.declarations);

    // Create the property
    const property = ts.property(propName, result.type);
    if (!isRequired) {
      property.optional();
    }

    // Add description if available
    if (propSchema.description && !refs.withoutDescriptions) {
      property.setDocComment(ts.docComment(propSchema.description));
    }

    objectProperties.push(property);
  }

  // Add index signature for additional properties
  if (schema.additionalProperties !== false) {
    objectProperties.push(ts.indexSignature('k', ts.stringType, ts.unknownType));
  }

  return {
    type: ts.objectType().addMultiple(objectProperties),
    declarations: allDeclarations,
  };
}
