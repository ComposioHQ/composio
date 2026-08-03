/**
 * Packed @composio/core and @composio/openai compatibility with OpenAI 7.
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
        setup: 'npm run install:composio && npm run typecheck',
      });
    }, 300_000);

    describe('setup', () => {
      it('installs and typechecks successfully', () => {
        expect(result.setup.exitCode).toBe(0);
        expect(result.setup.stdout).toContain('openai v7 compatibility typecheck passed');
      });
    });

    describe('OpenAI v7 + Zod v4 compatibility', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('loads OpenAI 7 and Zod 4', () => {
        expect(result.stdout).toContain('zod@4 works');
        expect(result.stdout).toContain('openai@7 works');
      });

      it('constructs the Composio client', () => {
        expect(result.stdout).toContain('@composio/core works');
      });

      it('wraps tools through both providers', () => {
        expect(result.stdout).toContain('core wrapTool works');
        expect(result.stdout).toContain('responses wrapTool works');
      });

      it('runs without network access', () => {
        expect(result.stdout).toContain('All packages work together!');
      });
    });
  },
});
