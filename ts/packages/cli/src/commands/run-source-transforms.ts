/**
 * Source rewrites that `composio run` applies to a user script before running it
 * in the confined runtime: slug extraction for definition warming, and the
 * preparation that strips TypeScript, hoists imports, and turns a trailing
 * expression into a return value.
 *
 * JavaScript is parsed with acorn (the parser the runtime itself uses), and
 * TypeScript becomes JavaScript with sucrase, which drops types and keeps every
 * line where it was. Neither needs the TypeScript compiler.
 */
import {
  parse,
  type AnyNode,
  type ModuleDeclaration,
  type Node,
  type Program,
  type Statement,
} from 'acorn';
import { Result } from 'effect';
import { transform } from 'sucrase';

const PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  locations: true,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  allowHashBang: true,
} as const;

const parseJavaScript = (source: string) => Result.try(() => parse(source, PARSE_OPTIONS));

/** The script as JavaScript, or a failure when sucrase cannot read it as TypeScript either. */
const compileTypeScript = (source: string, fileName: string) =>
  Result.try(() =>
    transform(source, {
      transforms: /\.[cm]?tsx$|\.jsx$/.test(fileName) ? ['typescript', 'jsx'] : ['typescript'],
      jsxRuntime: 'preserve',
      disableESTransforms: true,
      // An import the script never uses still runs, as under `verbatimModuleSyntax`, so an
      // import the runtime cannot provide fails the run instead of vanishing. `import type`
      // is still removed.
      keepUnusedImports: true,
      filePath: fileName,
      sourceMapOptions: { compiledFilename: 'composio-run.js' },
    })
  );

/** Every node below `node`, depth first. */
const descendants = (node: unknown): Array<AnyNode> => {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(descendants);
  const children = Object.values(node).flatMap(descendants);
  return 'type' in node && typeof node.type === 'string'
    ? [node as AnyNode, ...children]
    : children;
};

export const extractInlineExecuteToolSlugs = (source: string): ReadonlyArray<string> => {
  if (!source.trim()) {
    return [];
  }
  const program = Result.getOrUndefined(
    parseJavaScript(source).pipe(
      Result.orElse(() =>
        compileTypeScript(source, 'composio-run-inline.tsx').pipe(
          Result.flatMap(({ code }) => parseJavaScript(code))
        )
      )
    )
  );
  const slugs = new Set<string>();
  descendants(program).forEach(node => {
    if (node.type !== 'CallExpression') return;
    if (node.callee.type !== 'Identifier' || node.callee.name !== 'execute') return;
    const [slug] = node.arguments;
    if (slug?.type === 'Literal' && typeof slug.value === 'string') {
      slugs.add(slug.value);
    } else if (slug?.type === 'TemplateLiteral' && slug.expressions.length === 0) {
      const [quasi] = slug.quasis;
      if (quasi?.value.cooked) slugs.add(quasi.value.cooked);
    }
  });
  return [...slugs];
};

/** A script prepared for the confined runtime (`runScript` in `src/services/run-script/engine.ts`). */
export type PreparedRunProgram = {
  /** The script's import declarations, joined on one line. */
  readonly imports: string;
  /** The script with imports blanked and a trailing expression returned. */
  readonly body: string;
  /** Maps `body` back to the script when it was compiled from TypeScript; lines are kept otherwise. */
  readonly sourceMap?: string;
  /** Where the preparation added or removed text on a line, to map columns back. */
  readonly columnShifts: ReadonlyArray<ColumnShift>;
};

/** Text the preparation added (`delta` > 0) or removed on one line, from `column` on. */
export type ColumnShift = {
  readonly line: number;
  readonly column: number;
  readonly delta: number;
};

/**
 * Modules a script may import whose values the runtime defines itself: each maps to the global
 * that stands for the module, so `import { z } from "zod"` keeps working.
 */
const VIRTUAL_MODULES: Readonly<Record<string, string>> = {
  zod: 'z',
  'zod/v4': 'z',
  process: 'process',
  'node:process': 'process',
};

type Edit = { readonly start: number; readonly end: number; readonly text: string };

/** `text` followed by the newlines of `original`, so every line after it keeps its number. */
const keepingLines = (text: string, original: string) => `${text}${original.replace(/[^\n]/g, '')}`;

/** A syntax error in the script, reported by the runtime when it compiles the body. */
const unparsed = (javaScript: string): PreparedRunProgram => ({
  imports: '',
  body: javaScript,
  columnShifts: [],
});

const JAVASCRIPT_FILE = /\.[cm]?js$/i;

/**
 * The script as JavaScript. A `.js`, `.mjs` or `.cjs` file is left as written. Anything else (a
 * `.ts` file, inline code) is TypeScript, as Bun read it, so `f<number>(1)` is a call and not two
 * comparisons: compiling drops types and type-only imports and keeps every line where it was.
 * When that changes nothing, the source map is left out and positions are the user's own.
 */
const toJavaScript = (
  source: string,
  fileName: string
): { readonly code: string; readonly sourceMap?: string } =>
  JAVASCRIPT_FILE.test(fileName)
    ? { code: source }
    : Result.match(compileTypeScript(source, fileName), {
        onSuccess: ({ code, sourceMap }) =>
          code === source || !sourceMap ? { code } : { code, sourceMap: JSON.stringify(sourceMap) },
        // Not TypeScript: the runtime reports the syntax error.
        onFailure: () => ({ code: source }),
      });

type ImportDeclaration = Extract<ModuleDeclaration, { type: 'ImportDeclaration' }>;

const importedName = (name: { type: string; name?: string; value?: unknown }) =>
  name.type === 'Identifier' ? String(name.name) : String(name.value);

/** What replaces an import of a virtual module: `const` bindings to the global that stands for it. */
const virtualImportBindings = (declaration: ImportDeclaration, global: string): string =>
  declaration.specifiers
    .flatMap(specifier => {
      const local = specifier.local.name;
      if (specifier.type === 'ImportSpecifier') {
        const imported = importedName(specifier.imported);
        if (imported === global) return local === global ? [] : [`const ${local} = ${global};`];
        return [`const ${local} = ${global}.${imported};`];
      }
      return local === global ? [] : [`const ${local} = ${global};`];
    })
    .join(' ');

const moduleSpecifier = (statement: Statement | ModuleDeclaration): string | undefined =>
  'source' in statement && statement.source && typeof statement.source.value === 'string'
    ? statement.source.value
    : undefined;

/**
 * Prepares a `composio run` script for the confined runtime, keeping its line numbers:
 *
 * - TypeScript becomes JavaScript (JavaScript is left alone).
 * - Imports are hoisted out of the body, which runs inside an async function: an import of
 *   `zod` or `process` becomes a binding to the runtime's own `z` or `process`; any other is
 *   kept, for the runtime to resolve or reject.
 * - `export` modifiers are dropped, since the script is not a module anyone imports.
 * - A trailing expression becomes the function's return value, which the runtime prints.
 */
export const prepareRunProgram = (
  source: string,
  fileName = 'composio-run.ts'
): PreparedRunProgram => {
  const withoutHashbang = source.startsWith('#!') ? `//${source.slice(2)}` : source;
  const { code: javaScript, sourceMap } = toJavaScript(withoutHashbang, fileName);
  const parsed = Result.getOrUndefined(parseJavaScript(javaScript));
  if (!parsed) return unparsed(javaScript);
  return rewrite(parsed, javaScript, sourceMap);
};

const rewrite = (
  parsed: Program,
  javaScript: string,
  sourceMap: string | undefined
): PreparedRunProgram => {
  const edits: Array<Edit> = [];
  const imports: Array<string> = [];
  const columnShifts: Array<ColumnShift> = [];
  const shiftAt = (node: Node, delta: number) => {
    const start = node.loc!.start;
    columnShifts.push({ line: start.line, column: start.column, delta });
  };
  const replace = (node: Node, text: string) => {
    edits.push({
      start: node.start,
      end: node.end,
      text: keepingLines(text, javaScript.slice(node.start, node.end)),
    });
  };
  /** Removes `keyword ` at the start of `node`, so the rest of its line moves by a known amount. */
  const dropKeyword = (node: Node, keyword: RegExp) => {
    const match = keyword.exec(javaScript.slice(node.start));
    if (!match) return;
    edits.push({ start: node.start, end: node.start + match[0].length, text: '' });
    shiftAt(node, -match[0].length);
  };

  parsed.body.forEach(statement => {
    if (statement.type === 'ImportDeclaration') {
      const specifier = moduleSpecifier(statement);
      const virtual = specifier === undefined ? undefined : VIRTUAL_MODULES[specifier];
      if (virtual !== undefined) {
        replace(statement, virtualImportBindings(statement, virtual));
      } else {
        imports.push(javaScript.slice(statement.start, statement.end).replace(/\s*\n\s*/g, ' '));
        replace(statement, '');
      }
      return;
    }
    if (
      statement.type === 'ExportAllDeclaration' ||
      (statement.type === 'ExportNamedDeclaration' && !statement.declaration)
    ) {
      // `export … from "m"` loads "m": it is kept as an import, so the runtime loads the module
      // or rejects it like any other import, instead of the script silently skipping it.
      const specifier = moduleSpecifier(statement);
      if (specifier !== undefined && VIRTUAL_MODULES[specifier] === undefined) {
        imports.push(`import ${JSON.stringify(specifier)};`);
      }
      replace(statement, '');
      return;
    }
    if (statement.type === 'ExportNamedDeclaration') {
      dropKeyword(statement, /^export\s+/);
      return;
    }
    if (
      statement.type === 'ExportDefaultDeclaration' &&
      (statement.declaration.type === 'FunctionDeclaration' ||
        statement.declaration.type === 'ClassDeclaration') &&
      statement.declaration.id
    ) {
      dropKeyword(statement, /^export\s+default\s+/);
    }
  });

  const lastStatement = parsed.body.at(-1);
  if (lastStatement?.type === 'ExpressionStatement') {
    const expression = javaScript.slice(
      lastStatement.expression.start,
      lastStatement.expression.end
    );
    edits.push({
      start: lastStatement.start,
      end: lastStatement.end,
      text: `return (${expression});`,
    });
    shiftAt(lastStatement, 'return ('.length);
  }

  const body = [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, edit) => `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`,
      javaScript
    );

  return { imports: imports.join(' '), body, columnShifts, ...(sourceMap ? { sourceMap } : {}) };
};
