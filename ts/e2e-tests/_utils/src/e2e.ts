/**
 * Simplified e2e test API with auto-inferred cwd and suiteName.
 */

import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { E2EConfig } from './types';
import { getRepoRoot } from './config';
import { runE2E } from './runner';

/**
 * Validate that the provided import.meta.url is a valid file:// URL.
 */
function validateImportMetaUrl(url: string): void {
  if (!url) {
    throw new Error('e2e(): import.meta.url is required as first argument');
  }
  if (!url.startsWith('file://')) {
    throw new Error(
      `e2e(): import.meta.url must be a file:// URL, got: ${url}\n` +
        'Ensure you are calling e2e(import.meta.url, ...) from an ES module'
    );
  }
}

/**
 * Infer the working directory (cwd) from the caller's import.meta.url.
 * Returns a path relative to the repository root.
 */
function inferCwd(importMetaUrl: string, repoRoot: string): string {
  const callerPath = fileURLToPath(importMetaUrl);
  const callerDir = dirname(callerPath);
  const relativePath = relative(repoRoot, callerDir);
  // Normalize to forward slashes for Docker
  return relativePath.split(/[\\/]/).join('/');
}

/**
 * Run e2e tests with full bun:test capabilities.
 *
 * This function sets up bun:test describe/it blocks internally.
 * When the test file is run via `bun test`, the full bun:test API
 * is available in your defineTests callback.
 *
 * @param importMetaUrl - Pass `import.meta.url` from your test file
 * @param config - Test configuration with defineTests callback
 *
 * @example
 * ```typescript
 * // e2e.test.ts
 * import { e2e } from '@e2e-tests/utils';
 * import type { E2ETestResult } from '@e2e-tests/utils';
 *
 * e2e(import.meta.url, {
 *   versions: { node: ['20.19.0', '22.12.0'] },
 *   env: { COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY },
 *   defineTests: ({ describe, it, expect, beforeAll, runFixture }) => {
 *     let result: E2ETestResult;
 *
 *     beforeAll(async () => {
 *       result = await runFixture({ filename: 'fixtures/test.mjs' });
 *     }, TIMEOUTS.FIXTURE);
 *
 *     describe('output', () => {
 *       it('exits successfully', () => {
 *         expect(result.exitCode).toBe(0);
 *       });
 *     });
 *   },
 * });
 * ```
 */
export function e2e(importMetaUrl: string, config: E2EConfig): void {
  validateImportMetaUrl(importMetaUrl);

  const repoRoot = getRepoRoot();
  const cwd = inferCwd(importMetaUrl, repoRoot);
  const suiteName = cwd.split('/').pop() ?? 'unknown';

  runE2E({ ...config, cwd, suiteName });
}
