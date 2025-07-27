import * as ts from '@composio/ts-builders';
import type { JsonSchemaObject, Refs, TypeDeclarationResult } from '../types';
import { parseString } from './parse-string';
import { parseNumber } from './parse-number';
import { parseBoolean } from './parse-boolean';
import { parseArray } from './parse-array';
import { parseObject } from './parse-object';
import { parseNull } from './parse-null';
import { parseUnion } from './parse-union';

export function parseSchema(schema: JsonSchemaObject, refs: Refs): TypeDeclarationResult {
  // Handle boolean schema
  if (typeof schema === 'boolean') {
    return {
      type: schema ? ts.unknownType : ts.neverType,
      declarations: [],
    };
  }

  // Handle parser override
  if (refs.parserOverride) {
    const override = refs.parserOverride(schema, refs);
    if (override) {
      return {
        type: override,
        declarations: [],
      };
    }
  }

  // Handle circular references
  if (refs.seen.has(schema)) {
    const seen = refs.seen.get(schema)!;
    if (seen.r) {
      return {
        type: seen.r,
        declarations: [],
      };
    }
  }

  // Mark as seen
  const seenRef = { n: refs.seen.size, r: undefined as unknown as ts.TypeBuilder };
  refs.seen.set(schema, seenRef);

  let result: TypeDeclarationResult;

  // Handle different schema types
  if (schema.anyOf || schema.oneOf) {
    result = parseUnion(schema, refs);
  } else if (schema.type === 'string') {
    result = parseString(schema, refs);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    result = parseNumber(schema, refs);
  } else if (schema.type === 'boolean') {
    result = parseBoolean(schema, refs);
  } else if (schema.type === 'array') {
    result = parseArray(schema, refs);
  } else if (schema.type === 'object') {
    result = parseObject(schema, refs);
  } else if (schema.type === 'null') {
    result = parseNull(schema, refs);
  } else if (schema.enum) {
    // Handle enum types
    const enumTypes = schema.enum.map(value => {
      if (typeof value === 'string') {
        return ts.stringLiteral(value);
      } else if (typeof value === 'number') {
        // For numbers, we'll just use a namedType with the number as string
        return ts.namedType(value.toString());
      } else if (typeof value === 'boolean') {
        // For booleans, we'll use namedType with 'true' or 'false'
        return ts.namedType(value.toString());
      } else if (value === null) {
        return ts.nullType;
      } else {
        return ts.unknownType;
      }
    });

    result = {
      type: enumTypes.length === 1 ? enumTypes[0] : ts.unionType(enumTypes),
      declarations: [],
    };
  } else {
    // Fallback to unknown for unhandled cases
    result = {
      type: ts.unknownType,
      declarations: [],
    };
  }

  // Update the seen reference
  seenRef.r = result.type;

  return result;
}
