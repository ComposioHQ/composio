import * as ts from '@composio/ts-builders';
import type { JsonSchemaObject, Refs, TypeDeclarationResult } from '../types';
import { parseSchema } from './parse-schema';

export function parseArray(schema: JsonSchemaObject, refs: Refs): TypeDeclarationResult {
  if (schema.items) {
    const itemResult = parseSchema(schema.items as JsonSchemaObject, {
      ...refs,
      path: [...refs.path, 'items'],
    });

    return {
      type: ts.namedType('Array').addGenericArgument(itemResult.type),
      declarations: itemResult.declarations,
    };
  }

  // Fallback to Array<unknown>
  return {
    type: ts.namedType('Array').addGenericArgument(ts.unknownType),
    declarations: [],
  };
}
