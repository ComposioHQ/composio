import * as ts from '@composio/ts-builders';
import type { JsonSchemaObject, Refs, TypeDeclarationResult } from '../types';
import { parseSchema } from './parse-schema';

export function parseUnion(schema: JsonSchemaObject, refs: Refs): TypeDeclarationResult {
  const unionSchemas = schema.anyOf || schema.oneOf || [];
  const unionTypes: ts.TypeBuilder[] = [];
  const allDeclarations: Array<
    | {
        name: string;
        type: ts.TypeBuilder;
        description?: string;
      }
    | ts.TypeDeclaration
  > = [];

  for (let i = 0; i < unionSchemas.length; i++) {
    const unionSchema = unionSchemas[i] as JsonSchemaObject;
    const result = parseSchema(unionSchema, {
      ...refs,
      path: [...refs.path, i],
    });

    unionTypes.push(result.type);
    allDeclarations.push(...result.declarations);
  }

  if (unionTypes.length === 0) {
    return {
      type: ts.unknownType,
      declarations: [],
    };
  }

  if (unionTypes.length === 1) {
    return {
      type: unionTypes[0],
      declarations: allDeclarations,
    };
  }

  return {
    type: ts.unionType(unionTypes),
    declarations: allDeclarations,
  };
}
