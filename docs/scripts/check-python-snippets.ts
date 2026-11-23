/**
 * Compile maintained Python fences and type-check current SDK examples against
 * local SDK and provider source. Reference mode checks generated examples and
 * skips display signatures and explicit opt-outs.
 *
 * The Python helper attributes diagnostics using mypy's resolved AST symbols
 * and fully qualified types, not error-message class names. SDK call,
 * attribute, import, TypedDict, SDK-model indexing, SDK-result assignment, and
 * misspelled SDK-binding errors fail the gate; unrelated Python/third-party
 * errors are returned separately by the helper. A `# type: ignore` must name
 * its codes, carry an explanation, and still suppress an error.
 *
 * Requires uv and the locked python/pyproject.toml docs-snippets group.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  listCodeExampleFiles,
  listPythonReferenceFiles,
  parseCodeExamples,
  walkCodeExamples,
  type CodeExampleFile,
} from '../lib/code-examples';

export type PythonSnippet = {
  /** Module name for the temp file; unique per run. */
  id: string;
  path: string;
  /** Line of the opening fence; snippet line N is MDX line `line + N`. */
  line: number;
  code: string;
  /** False for legacy-SDK fences, which are only syntax-checked. */
  typeCheck: boolean;
};

export type PythonSnippetRule = 'python-syntax' | 'python-api' | 'python-directive' | 'python-reference';

export type PythonSnippetViolation = { path: string; line: number; rule: PythonSnippetRule; message: string };


const PYTHON_LANGS: Record<string, true> = { python: true, py: true };
type ReferenceOptOut = { path: string; line: number; reason: string };

const LEGACY_RE = /\(previous\)/i;

/** Every Python fence in `files`, in file and document order. */
export function collectPythonSnippets(
  files: CodeExampleFile[],
  reference?: { optOuts: ReferenceOptOut[] },
): PythonSnippet[] {
  const snippets: PythonSnippet[] = [];
  for (const file of files) {
    walkCodeExamples(parseCodeExamples(file.source, file.path).units, (unit, ancestors) => {
      if (unit.type !== 'fence' || PYTHON_LANGS[unit.lang] !== true) return;
      if (reference) {
        const meta = unit.info.slice(unit.lang.length).trim();
        if (meta === 'signature') return;
        if (meta) {
          const reason = /^nocheck="([^"]*)"$/u.exec(meta)?.[1]?.trim();
          if (!reason) {
            throw new Error(`${file.path}:${unit.line} Invalid Python reference fence options: ${meta}`);
          }
          reference.optOuts.push({ path: file.path, line: unit.line, reason });
          return;
        }
      }
      const legacy =
        !reference &&
        (LEGACY_RE.test(unit.info) ||
          ancestors.some((ancestor) => ancestor.type === 'tab' && LEGACY_RE.test(ancestor.value ?? '')));
      snippets.push({
        id: `snippet_${String(snippets.length).padStart(4, '0')}`,
        path: file.path,
        line: unit.line,
        code: unit.code,
        typeCheck: !legacy,
      });
    });
  }
  if (reference && snippets.length === 0) throw new Error('No checkable Python reference fences');
  return snippets;
}

const Diagnostic = z.object({ id: z.string(), line: z.number(), message: z.string() });
const HelperResult = z.object({
  syntax: z.array(Diagnostic),
  api: z.array(Diagnostic),
  /** Diagnostic evidence kept separate from SDK API violations. */
  other: z.array(Diagnostic),
  /** Unexplained, code-less, or unused `# type: ignore` comments. */
  directives: z.array(Diagnostic),
  mypy: z.array(z.string()),
});

export type PythonHelperResult = z.infer<typeof HelperResult>;

/** Map snippet-relative helper diagnostics to their rendered documentation source. */
export function pythonSnippetViolations(
  snippets: PythonSnippet[],
  result: PythonHelperResult,
  strict = false,
): PythonSnippetViolation[] {
  const byId = new Map(snippets.map((snippet) => [snippet.id, snippet]));
  return [
    ...result.syntax.map((diagnostic) => ({ ...diagnostic, rule: 'python-syntax' as const })),
    ...result.api.map((diagnostic) => ({ ...diagnostic, rule: 'python-api' as const })),
    ...result.directives.map((diagnostic) => ({ ...diagnostic, rule: 'python-directive' as const })),
    ...(strict ? result.other.map((diagnostic) => ({ ...diagnostic, rule: 'python-reference' as const })) : []),
  ].map(({ id, line, message, rule }) => {
    const snippet = byId.get(id);
    if (!snippet) throw new Error(`Python helper returned unknown snippet ${id}`);
    return { path: snippet.path, line: snippet.line + line, rule, message };
  });
}

const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PYTHON_ROOT = join(DOCS_ROOT, '../python');
// The SDK is a uv workspace member; keep its env in the gitignored python/.venv
// rather than an env at the workspace root.
const SDK_ENV = join(PYTHON_ROOT, '.venv');
const SDK_PYTHON = join(SDK_ENV, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const HELPER = join(DOCS_ROOT, 'scripts/python-snippets/check_snippets.py');

/** Runs the Python helper in the SDK env; exits 2 when `uv` is unavailable or the helper fails. */
export function runPythonHelper(
  snippets: PythonSnippet[],
  syntaxOnly = false,
  installedPython?: string,
): PythonHelperResult {
  const workDir = mkdtempSync(join(tmpdir(), 'python-snippets-'));
  try {
    const requestPath = join(workDir, 'request.json');
    writeFileSync(
      requestPath,
      JSON.stringify({
        workDir,
        sdkPython: installedPython ?? SDK_PYTHON,
        installed: installedPython !== undefined,
        syntaxOnly,
        snippets: snippets.map(({ id, code, typeCheck }) => ({ id, code, typeCheck })),
      }),
    );
    const result = spawnSync(
      'uv',
      [
        'run', '--quiet', '--frozen', '--project', PYTHON_ROOT, '--python', '3.12',
        '--no-default-groups',
        installedPython === undefined ? '--group' : '--only-group', 'docs-snippets',
        'python', HELPER, requestPath,
      ],
      {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
        env: {
          ...process.env,
          UV_PROJECT_ENVIRONMENT: installedPython === undefined ? SDK_ENV : join(workDir, 'checker-env'),
        },
      },
    );
    if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
      console.error('uv is required to check Python snippets: https://docs.astral.sh/uv/getting-started/installation/');
      process.exit(2);
    }
    if (result.status !== 0) {
      console.error(`Python snippet helper failed (exit ${result.status ?? result.signal}).`);
      process.exit(2);
    }
    return HelperResult.parse(JSON.parse(result.stdout));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean' },
      'syntax-only': { type: 'boolean' },
      reference: { type: 'boolean' },
      directory: { type: 'string' },
      'installed-python': { type: 'string' },
    },
  });
  const installed = values['installed-python'];
  const directory = values.directory === undefined ? undefined : resolve(values.directory);
  if ((!values.reference && (directory !== undefined || installed !== undefined)) ||
      (installed !== undefined && values['syntax-only'])) {
    throw new Error('Use --reference with --directory or --installed-python. Installed checks require type checking.');
  }
  const reference: { optOuts: ReferenceOptOut[] } | undefined = values.reference
    ? { optOuts: [] }
    : undefined;
  const snippets = reference
    ? collectPythonSnippets(listPythonReferenceFiles(DOCS_ROOT, directory), reference)
    : collectPythonSnippets(listCodeExampleFiles(DOCS_ROOT));
  const helper = runPythonHelper(snippets, values['syntax-only'], installed === undefined ? undefined : resolve(installed));
  const violations = pythonSnippetViolations(snippets, helper, installed !== undefined);
  violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);

  const counts: Record<string, number> = {};
  for (const violation of violations) counts[violation.rule] = (counts[violation.rule] ?? 0) + 1;

  if (values.json) {
    console.log(JSON.stringify({ snippets: snippets.length, violations, counts, ...reference }, null, 2));
  } else if (violations.length) {
    for (const { path, line, rule, message } of violations) console.log(`${path}:${line} ${rule} ${message}`);
    const fileCount = new Set(violations.map((violation) => violation.path)).size;
    console.log(
      `\n${violations.length} Python snippet violation(s) in ${fileCount} file(s), ${snippets.length} snippet(s) checked:`,
    );
    for (const rule of Object.keys(counts).sort()) console.log(`  ${rule}: ${counts[rule]}`);
  } else {
    console.log(`No Python snippet violations in ${snippets.length} snippet(s).`);
  }
  if (reference && !values.json) {
    for (const { path, line, reason } of reference.optOuts) console.log(`${path}:${line} opted out: ${reason}`);
  }
  process.exit(violations.length ? 1 : 0);
}

if (import.meta.main) main();
