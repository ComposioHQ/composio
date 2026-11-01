/**
 * Type-check authored examples outside the production Twoslash build: canonical
 * API overviews, authored reference pages, and plain Markdown FAQ/KB inputs.
 * Every diagnostic is retained; snippets are never executed.
 */
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { resolve } from 'node:path';
import { createTwoslasher, type TwoslashInstance } from 'twoslash';
import { listCodeExampleFiles, parseCodeExamples, walkCodeExamples, type CodeExampleFile } from '../lib/code-examples';

export type TypeScriptSnippet = { path: string; line: number; code: string; lang: string };
export type TypeScriptSnippetViolation = {
  path: string;
  line: number;
  rule: 'typescript-api' | 'typescript-directive' | 'typescript-checker';
  message: string;
};

const LANGUAGES: Record<string, string> = {
  typescript: 'ts', ts: 'ts', tsx: 'tsx', javascript: 'js', js: 'js', jsx: 'jsx',
};
const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Generated API/SDK copies are excluded by the shared canonical inventory. */
export function isUncoveredTypeScriptSource(path: string): boolean {
  return path.startsWith('api-overviews/') || path.startsWith('content/reference/') || path.endsWith('.md');
}

export function collectTypeScriptSnippets(files: readonly CodeExampleFile[]): TypeScriptSnippet[] {
  const snippets: TypeScriptSnippet[] = [];
  for (const file of files) {
    if (!isUncoveredTypeScriptSource(file.path)) continue;
    walkCodeExamples(parseCodeExamples(file.source, file.path).units, (unit) => {
      if (unit.type === 'fence' && LANGUAGES[unit.lang]) {
        snippets.push({ path: file.path, line: unit.line, code: unit.code, lang: LANGUAGES[unit.lang] });
      }
    });
  }
  return snippets;
}

export function createSnippetTwoslasher(docsRoot = DOCS_ROOT): TwoslashInstance {
  return createTwoslasher({
    vfsRoot: resolve(docsRoot),
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      moduleDetection: ts.ModuleDetectionKind.Force,
      strict: true,
      allowJs: true,
      checkJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: 'react',
      types: ['node'],
      ignoreDeprecations: '6.0',
    },
    handbookOptions: {
      // Return actual compiler errors instead of throwing about @errors labels.
      // This does NOT suppress, classify, or remove any compiler diagnostic.
      noErrorValidation: true,
      noErrors: false,
      noErrorsCutted: false,
      noStaticSemanticInfo: true,
      keepNotations: true,
    },
  });
}

/** Reject suppression comments without mistaking string literals for directives. */
function withoutBlanketSuppressions(code: string): { code: string; lines: number[] } {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
  const changes: { start: number; end: number }[] = [];
  const lines: number[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    if (!/^[/*\s]*@(?:noErrors(?:Cutted)?|noCheck|ts-nocheck)\b/.test(scanner.getTokenText())) continue;
    const start = scanner.getTokenPos();
    changes.push({ start, end: scanner.getTextPos() });
    lines.push(code.slice(0, start).split('\n').length);
  }
  for (const { start, end } of changes.reverse()) {
    code = code.slice(0, start) + code.slice(start, end).replace(/[^\r\n]/g, ' ') + code.slice(end);
  }
  return { code, lines };
}

export function checkTypeScriptSnippets(
  snippets: readonly TypeScriptSnippet[],
  twoslasher = createSnippetTwoslasher(),
): TypeScriptSnippetViolation[] {
  const violations: TypeScriptSnippetViolation[] = [];
  for (const snippet of snippets) {
    const cleaned = withoutBlanketSuppressions(snippet.code);
    for (const line of cleaned.lines) {
      violations.push({
        path: snippet.path, line: snippet.line + line, rule: 'typescript-directive',
        message: 'Blanket TypeScript/Twoslash diagnostic suppression is not allowed; correct the example or document a precise typing gap.',
      });
    }
    try {
      let source = cleaned.code;
      let result = twoslasher(source, snippet.lang);
      let preludeLines = 0;
      // Ask the compiler, not a regex or a whole-fence binding scan, whether the
      // conventional fragment variable is genuinely unresolved in this scope.
      // Local declarations and nested parameters retain their original types.
      const needsComposio = result.errors.some((error) =>
        (error.code === 2304 || error.code === 2552) && source.slice(error.start, error.start + error.length) === 'composio');
      if (needsComposio) {
        let binding = '__DocsFragmentComposio';
        while (source.includes(binding)) binding += '_';
        const prelude = snippet.lang === 'js' || snippet.lang === 'jsx'
          ? `import { Composio as ${binding} } from "@composio/core";\nconst composio = new ${binding}();\n`
          : `import type { Composio as ${binding} } from "@composio/core";\ndeclare const composio: ${binding};\n`;
        preludeLines = prelude.split('\n').length - 1;
        source = prelude + source;
        result = twoslasher(source, snippet.lang);
      }
      for (const error of result.errors) {
        if (error.level && error.level !== 'error') continue;
        const line = error.line + 1 - preludeLines;
        violations.push({
          path: snippet.path,
          line: snippet.line + Math.max(1, line),
          rule: line < 1 ? 'typescript-checker' : 'typescript-api',
          message: `${error.text} [TS${error.code ?? 'unknown'}]`,
        });
      }
    } catch (error) {
      violations.push({ path: snippet.path, line: snippet.line, rule: 'typescript-checker', message: String(error) });
    }
  }
  return violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.message.localeCompare(b.message));
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--json')) {
    console.error('Usage: bun scripts/check-typescript-snippets.ts [--json]');
    process.exit(2);
  }
  const snippets = collectTypeScriptSnippets(listCodeExampleFiles(DOCS_ROOT));
  const violations = checkTypeScriptSnippets(snippets);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ snippets: snippets.length, violations }, null, 2));
  } else if (violations.length) {
    for (const violation of violations) console.log(`${violation.path}:${violation.line} ${violation.rule} ${violation.message}`);
    console.log(`\n${violations.length} TypeScript violation(s); ${snippets.length} snippet(s) checked.`);
  } else {
    console.log(`No TypeScript snippet violations in ${snippets.length} snippet(s).`);
  }
  process.exit(violations.length ? 1 : 0);
}

if (import.meta.main) main();
