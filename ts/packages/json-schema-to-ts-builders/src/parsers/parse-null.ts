import * as ts from '@composio/ts-builders';
import type { JsonSchemaObject, Refs, TypeDeclarationResult } from '../types';

export function parseNull(_schema: JsonSchemaObject, _refs: Refs): TypeDeclarationResult {
  return {
    type: ts.nullType,
    declarations: [],
  };
}
