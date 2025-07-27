import * as ts from '@composio/ts-builders';
import { parseSchema } from './parsers/parse-schema';
import type { JsonSchema, JsonSchemaToTsOptions, TypeDeclarationResult } from './types';

export function jsonSchemaToTsBuilders(
  schema: JsonSchema,
  typeName: string,
  options: JsonSchemaToTsOptions = {}
): TypeDeclarationResult & { mainDeclaration: ts.TypeDeclaration } {
  if (typeof schema === 'boolean') {
    const type = schema ? ts.unknownType : ts.neverType;
    const mainDeclaration = ts.typeDeclaration(typeName, type);

    return {
      type,
      declarations: [],
      mainDeclaration,
    };
  }

  const result = parseSchema(schema, {
    path: [],
    seen: new Map(),
    ...options,
  });

  const mainDeclaration = ts.typeDeclaration(typeName, result.type);

  // Add description if available
  if (schema.description && !options.withoutDescriptions) {
    mainDeclaration.setDocComment(ts.docComment(schema.description));
  }

  // Convert helper type objects to TypeDeclaration instances
  const declarations = result.declarations.map(decl => {
    if ('name' in decl && 'type' in decl && !('addGenericParameter' in decl)) {
      // This is an object, convert to TypeDeclaration
      const typeDecl = ts.typeDeclaration(
        (decl as unknown as { name: string }).name,
        (decl as unknown as { type: ts.TypeBuilder }).type
      );
      if (
        (decl as unknown as { description: string }).description &&
        !options.withoutDescriptions
      ) {
        typeDecl.setDocComment(
          ts.docComment((decl as unknown as { description: string }).description)
        );
      }
      return typeDecl;
    }
    // Already a TypeDeclaration
    return decl as ts.TypeDeclaration;
  });

  return {
    type: result.type,
    declarations,
    mainDeclaration,
  };
}
