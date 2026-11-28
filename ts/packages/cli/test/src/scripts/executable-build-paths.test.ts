import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every CLI executable (the host build, the release cross-compiles, the e2e
 * Docker images) is compiled by `compileExecutable` in `scripts/_shared.ts`,
 * so a flag or build plugin added there reaches every build that tests or ships
 * the CLI. A second `bun build --compile` command drifts from it silently; this
 * test finds one in any tracked file except documentation and vendored sources.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const ALLOWED = new Set([
  'ts/packages/cli/scripts/_shared.ts',
  'ts/packages/cli/test/src/scripts/executable-build-paths.test.ts',
]);
const COMPILE_FLAG = /(?<![\w-])--compile(?![\w-])/;

const findCompileFlags = (relativePath: string, contents: string): ReadonlyArray<string> =>
  contents
    .split('\n')
    .flatMap((line, index) =>
      COMPILE_FLAG.test(line) ? [`${relativePath}:${index + 1}: ${line.trim()}`] : []
    );

const trackedFiles = (): ReadonlyArray<string> =>
  execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    // `<mode> <object> <stage>\t<path>`; symlinks and submodules point at content listed elsewhere.
    .flatMap(entry => {
      const [meta = '', relativePath = ''] = entry.split('\t');
      return /^100(644|755) /.test(meta) ? [relativePath] : [];
    })
    .filter(
      relativePath =>
        !ALLOWED.has(relativePath) &&
        !relativePath.endsWith('.md') &&
        !relativePath.startsWith('ts/vendor/')
    );

describe('CLI executable builds', () => {
  it('compile only through compileExecutable in scripts/_shared.ts', () => {
    const offenders = trackedFiles().flatMap(relativePath => {
      const contents = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
      return findCompileFlags(relativePath, contents);
    });

    expect(offenders).toStrictEqual([]);
  });

  it('finds the flag in shell commands and in argument arrays', () => {
    const found = findCompileFlags(
      'example',
      [
        'RUN bun build ./src/bin.ts --compile --outfile /out/composio',
        "  '--compile',",
        'args.push("--compile")',
        'bun build --compile=true',
        'bun build --compile-jit-policy=2',
        'echo --compiled',
      ].join('\n')
    );

    expect(found.map(line => line.split(':')[1])).toStrictEqual(['1', '2', '3', '4']);
  });
});
