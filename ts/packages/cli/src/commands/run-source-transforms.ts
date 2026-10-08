/**
 * Source rewrites that `composio run` applies to a user script before handing it
 * to Bun: slug extraction for definition warming, and the two wrappers that turn
 * a trailing expression into a return value.
 *
 * These live outside `run.cmd.ts` because they are the CLI's only consumer of
 * the TypeScript compiler, which costs roughly 95ms to evaluate. `run.cmd.ts`
 * imports this module dynamically from inside its handler, so a `composio
 * execute` or `composio whoami` invocation never pays for it.
 */
import ts from 'typescript';

export const extractInlineExecuteToolSlugs = (source: string): ReadonlyArray<string> => {
  if (!source.trim()) {
    return [];
  }

  const parsed = ts.createSourceFile(
    'composio-run-inline.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const slugs = new Set<string>();

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'execute'
    ) {
      const [slugArg] = node.arguments;
      if (slugArg && ts.isStringLiteralLike(slugArg)) {
        slugs.add(slugArg.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return [...slugs];
};

export const wrapInlineCodeForRun = (source: string): string => {
  const parsed = ts.createSourceFile(
    'composio-run-inline.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const statements = [...parsed.statements];
  if (statements.length === 0) {
    return source;
  }

  const lastStatement = statements.at(-1);
  if (!lastStatement || !ts.isExpressionStatement(lastStatement)) {
    return source;
  }

  const prefix = source.slice(0, lastStatement.getFullStart());
  const suffix = source.slice(lastStatement.getEnd());
  const expressionText = lastStatement.expression.getText(parsed);
  return `${prefix}return (${expressionText});${suffix}`;
};

export const wrapFileSourceForRun = (source: string): string => {
  const parsed = ts.createSourceFile(
    'composio-run-file.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const statements = [...parsed.statements];
  const firstNonImportIndex = statements.findIndex(statement => !ts.isImportDeclaration(statement));
  if (firstNonImportIndex === -1) {
    return source;
  }

  const bodyStart = statements[firstNonImportIndex]!.getFullStart();
  const importPrefix = source.slice(0, bodyStart);
  const body = source.slice(bodyStart);
  return [
    importPrefix,
    'const __composioResult = await (async () => {',
    wrapInlineCodeForRun(body),
    '})();',
    'if (__composioResult !== undefined) {',
    '  console.log(__composioResult);',
    '}',
    '',
  ].join('\n');
};
