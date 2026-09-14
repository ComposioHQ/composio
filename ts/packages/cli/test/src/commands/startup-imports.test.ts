import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Modules that must never be evaluated by merely building the command tree.
 * The TypeScript compiler and the generation pipeline cost ~165ms of module
 * evaluation and are only needed by `composio run` and `composio generate`,
 * which import them from inside their handlers. A static import anywhere on the
 * startup path silently puts that cost back on every invocation, so this test
 * loads the command tree in a fresh Bun process and inspects what it pulled in.
 */
const FORBIDDEN_AT_STARTUP: ReadonlyArray<string> = [
  '/node_modules/typescript/',
  '/openapi-typescript/',
  '/packages/ts-builders/',
  '/src/generation/',
  '/src/commands/run-source-transforms',
];

/**
 * Runs inside `bun -e`. Bun's module registry lists every evaluated file, ESM
 * and CommonJS alike. The probe reports only the verdict: the full registry is
 * ~1000 paths, past what Bun flushes to a pipe before exiting.
 */
const PROBE = [
  "await import('./src/commands/index.ts');",
  'const forbidden = JSON.parse(process.env.FORBIDDEN_AT_STARTUP);',
  'const loaded = Object.keys(require.cache);',
  'console.log(JSON.stringify({',
  "  loadedCommandTree: loaded.some(file => file.endsWith('/src/commands/index.ts')),",
  '  eagerlyLoaded: loaded.filter(file => forbidden.some(fragment => file.includes(fragment))),',
  '}));',
].join('\n');

describe('CLI startup imports', () => {
  it('builds the command tree without evaluating the compiler or generation pipeline', () => {
    const result = spawnSync('bun', ['-e', PROBE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        FORBIDDEN_AT_STARTUP: JSON.stringify(FORBIDDEN_AT_STARTUP),
      },
    });

    expect(result.status, result.stderr).toBe(0);
    const verdict: { loadedCommandTree: boolean; eagerlyLoaded: ReadonlyArray<string> } =
      JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}');

    expect(verdict.loadedCommandTree).toBe(true);
    expect(verdict.eagerlyLoaded).toEqual([]);
  }, 30_000);
});
