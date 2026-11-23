import { Data, Effect } from 'effect';
import ts from 'typescript6';
import type { FenceLocation } from './pages';
import { compile, referenceCompilerOptions, type Compilation } from './program';

export type ViolationRule =
  | 'parse'
  | 'fence-option'
  | 'suppression'
  | 'unresolved-name'
  | 'unresolved-module'
  | 'type'
  | 'checker'
  | 'program';

/** One failure. Program-level failures have no page, line or headings. */
export interface Violation {
  readonly page: string | null;
  readonly line: number | null;
  readonly className: string | null;
  readonly section: string | null;
  readonly method: string | null;
  readonly rule: ViolationRule;
  readonly message: string;
}

export interface Snippet {
  readonly location: FenceLocation;
  readonly extension: 'ts' | 'tsx';
  readonly code: string;
}

export class CompilerError extends Data.TaggedError('CompilerError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export const violationAt = (
  location: FenceLocation,
  rule: ViolationRule,
  message: string,
  offset = 0
): Violation => ({ ...location, line: location.line + offset, rule, message });

const SUPPRESSION = /^[/*\s]*@(?:noErrors(?:Cutted)?|noCheck|ts-nocheck)\b/;

/**
 * Finds blanket suppression comments with the TypeScript scanner, so string literals never count,
 * and blanks them so the fence is still checked. Lines are 1-based within the fence.
 */
export const withoutBlanketSuppressions = (source: string) => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source
  );
  const comments: { start: number; end: number }[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }
    if (SUPPRESSION.test(scanner.getTokenText())) {
      comments.push({ start: scanner.getTokenStart(), end: scanner.getTokenEnd() });
    }
  }
  let code = source;
  for (const { start, end } of comments.toReversed()) {
    code = code.slice(0, start) + code.slice(start, end).replace(/[^\r\n]/g, ' ') + code.slice(end);
  }
  return { code, lines: comments.map(({ start }) => source.slice(0, start).split('\n').length) };
};

/** Pages that document the session object, where examples may use an undeclared `session`. */
const SESSION_PAGES = new Set(['session.mdx', 'session-files.mdx']);

/** The names an example may leave undeclared on a page; every other free name must be declared. */
const fragmentNames = (page: string) =>
  SESSION_PAGES.has(page.slice(page.lastIndexOf('/') + 1)) ? ['composio', 'session'] : ['composio'];

const unusedName = (code: string, name: string) => {
  let candidate = name;
  while (code.includes(candidate)) candidate += '_';
  return candidate;
};

/** A one-line, typed declaration for each fragment name; never `any`. */
const preludeFor = (code: string, names: ReadonlySet<string>) => {
  const parts: string[] = [];
  if (names.has('composio')) {
    const composio = unusedName(code, '__ReferenceComposio');
    parts.push(
      `import type { Composio as ${composio} } from '@composio/core'; declare const composio: ${composio};`
    );
  }
  if (names.has('session')) {
    const session = unusedName(code, '__ReferenceSession');
    const provider = unusedName(code, '__ReferenceProvider');
    parts.push(
      `import type { OpenAIProvider as ${provider}, ToolRouterSession as ${session} } from '@composio/core'; ` +
        `declare const session: ${session}<unknown, unknown, ${provider}>;`
    );
  }
  return parts.length === 0 ? '' : `${parts.join(' ')}\n`;
};

const UNRESOLVED_NAME = new Set([2304, 2552, 18004]);
const UNRESOLVED_MODULE = new Set([2307, 2792]);

const ruleFor = (code: number): ViolationRule =>
  UNRESOLVED_NAME.has(code)
    ? 'unresolved-name'
    : UNRESOLVED_MODULE.has(code)
      ? 'unresolved-module'
      : 'type';

const messageOf = (diagnostic: ts.Diagnostic) =>
  `${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')} [TS${diagnostic.code}]`;

/** The allowlisted names the compiler reports unresolved in one example. */
const unresolvedFragmentNames = (
  compilation: Compilation,
  fileName: string,
  allowed: ReadonlyArray<string>
) => {
  const sourceFile = compilation.program.getSourceFile(fileName);
  const names = new Set<string>();
  for (const diagnostic of compilation.fileDiagnostics.get(fileName) ?? []) {
    if (!UNRESOLVED_NAME.has(diagnostic.code) || diagnostic.start === undefined || !sourceFile)
      continue;
    const name = sourceFile.text.slice(
      diagnostic.start,
      diagnostic.start + (diagnostic.length ?? 0)
    );
    if (allowed.includes(name)) names.add(name);
  }
  return names;
};

const programViolation = (diagnostic: ts.Diagnostic): Violation => ({
  page: null,
  line: null,
  className: null,
  section: null,
  method: null,
  rule: 'program',
  message: diagnostic.file
    ? `${diagnostic.file.fileName}: ${messageOf(diagnostic)}`
    : messageOf(diagnostic),
});

/**
 * Type-checks every example in one program. Examples that use an allowlisted name without declaring
 * it get a typed declaration and are checked again; line numbers stay relative to the fence.
 */
export const checkSnippets = (
  snippets: ReadonlyArray<Snippet>,
  coreRoot: string,
  overrides: ts.CompilerOptions = {}
) =>
  Effect.try({
    try: () => {
      const options = { ...referenceCompilerOptions(coreRoot), ...overrides };
      const fileNames = snippets.map(
        (snippet, index) => `${coreRoot}/.reference-check/${index}.${snippet.extension}`
      );
      const first = compile(
        new Map(fileNames.map((fileName, index) => [fileName, snippets[index].code])),
        options,
        coreRoot
      );
      const preludes = snippets.map((snippet, index) =>
        preludeFor(
          snippet.code,
          unresolvedFragmentNames(first, fileNames[index], fragmentNames(snippet.location.page))
        )
      );
      const final = preludes.some(prelude => prelude !== '')
        ? compile(
            new Map(
              fileNames.map((fileName, index) => [fileName, preludes[index] + snippets[index].code])
            ),
            options,
            coreRoot,
            first.program
          )
        : first;

      const violations: Violation[] = final.programDiagnostics.map(programViolation);
      snippets.forEach((snippet, index) => {
        const preludeLines = preludes[index] === '' ? 0 : 1;
        const sourceFile = final.program.getSourceFile(fileNames[index]);
        for (const diagnostic of final.fileDiagnostics.get(fileNames[index]) ?? []) {
          const line =
            sourceFile && diagnostic.start !== undefined
              ? sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1 - preludeLines
              : 0;
          violations.push(
            line < 1
              ? violationAt(
                  snippet.location,
                  'checker',
                  `The declaration the checker adds failed: ${messageOf(diagnostic)}`
                )
              : violationAt(snippet.location, ruleFor(diagnostic.code), messageOf(diagnostic), line)
          );
        }
      });
      return violations;
    },
    catch: cause =>
      new CompilerError({
        message: `TypeScript failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
