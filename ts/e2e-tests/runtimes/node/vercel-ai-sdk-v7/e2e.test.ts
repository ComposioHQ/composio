/**
 * @composio/vercel + AI SDK v7 compatibility e2e test.
 *
 * Verifies that @composio/vercel installs, typechecks, and executes wrapped
 * tools with ai@7.
 */

import { e2e, type E2ETestResultWithSetup } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  versions: { node: ['22.22.3', '24.17.0', '25.9.0'] },
  usesFixtures: true,
  defineTests: ({ runFixture }) => {
    let result: E2ETestResultWithSetup;

    beforeAll(async () => {
      result = await runFixture({
        filename: 'index.mjs',
        // `install:vercel` packs and installs the provider tarball, which reifies
        // the full fixture dependency tree, so no separate `npm install` is needed.
        setup: 'npm run install:vercel && npm run typecheck',
      });
    }, 300_000);

    describe('setup', () => {
      it('installs and typechecks successfully', () => {
        expect(result.setup.exitCode).toBe(0);
        expect(result.setup.stdout).toContain('vercel ai sdk compatibility typecheck passed');
      });
    });

    describe('@composio/vercel + ai@7', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('wraps tools using inputSchema', () => {
        expect(result.stdout).toContain('WRAPPED_TOOL_INPUT_SCHEMA_OK');
      });

      it('executes object inputs', () => {
        expect(result.stdout).toContain('OBJECT_INPUT_EXECUTION_OK');
      });

      it('normalizes JSON string inputs', () => {
        expect(result.stdout).toContain('STRING_INPUT_EXECUTION_OK');
      });

      it('accepts AI SDK v7 execution options', () => {
        expect(result.stdout).toContain('V7_EXECUTION_OPTIONS_OK');
      });

      it('produces a ToolSet-compatible collection', () => {
        expect(result.stdout).toContain('TOOL_SET_OK');
      });
    });
  },
});
