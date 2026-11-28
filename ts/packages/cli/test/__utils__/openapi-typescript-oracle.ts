import ts from 'typescript';
import openapiTS, { type OpenAPI3, astToString } from 'openapi-typescript';

/** `type <name> = …;` as openapi-typescript and the compiler's printer print it, or why openapi-typescript refused the schema. */
export const printWithOpenApiTypeScript = async (
  name: string,
  properties: unknown
): Promise<
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: unknown }
> => {
  const definition = {
    openapi: '3.1.0',
    components: { schemas: { [name]: { type: 'object', properties } } },
  } as unknown as OpenAPI3;
  const nodes = await openapiTS(definition, { silent: true }).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error })
  );
  if (!nodes.ok) return nodes;
  const components = nodes.value.find(
    (node): node is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(node) && node.name.escapedText === 'components'
  )!;
  const sourceFile = ts.createSourceFile(
    'virtual.ts',
    astToString(components),
    ts.ScriptTarget.Latest,
    true
  );
  const schemas = components.members.find(
    member => ts.isPropertySignature(member) && (member.name as ts.Identifier).text === 'schemas'
  ) as ts.PropertySignature;
  const payload = (schemas.type as ts.TypeLiteralNode).members.find(
    member => ts.isPropertySignature(member) && (member.name as ts.Identifier).text === name
  ) as ts.PropertySignature;
  const type = payload.type!;
  const typeNode =
    ts.isTypeLiteralNode(type) && type.members.length > 0
      ? type
      : ts.isTypeLiteralNode(type) ||
          (ts.isTypeReferenceNode(type) &&
            ts.isIdentifier(type.typeName) &&
            (type.typeName.text === 'object' || type.typeName.text === 'Record'))
        ? ts.factory.createTypeReferenceNode('object')
        : ts.factory.createTypeReferenceNode('unknown');
  const printed = ts
    .createPrinter({ removeComments: false })
    .printNode(
      ts.EmitHint.Unspecified,
      ts.factory.createTypeAliasDeclaration([], name, undefined, typeNode),
      sourceFile
    );
  return { ok: true, text: printed.replace(/^ {4}/gm, '  ') };
};
