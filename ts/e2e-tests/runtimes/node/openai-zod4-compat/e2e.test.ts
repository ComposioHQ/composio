/**
 * OpenAI v7 + Zod v4 compatibility e2e test
 *
 * Verifies that packed @composio/core and @composio/openai packages install,
 * typecheck, and run with openai@7 and zod@4.
 */

import { e2e, type E2ETestResultWithSetup } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  versions: { node: ['22.22.3', '24.17.0', '25.9.0'] },
  usesFixtures: true,
  defineTests: ({ runFixture }) => {
    let result: E2ETestResultWithSetup;

    // npm install inside Docker needs more time than the default TIMEOUTS.FIXTURE (120s)
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

      it('zod@4 works', () => {
        expect(result.stdout).toContain('zod@4 works');
      });

      it('openai@7 works', () => {
        expect(result.stdout).toContain('openai@7 works');
      });

      it('@composio/core works', () => {
        expect(result.stdout).toContain('@composio/core works');
      });

      it('wrapTool works', () => {
        expect(result.stdout).toContain('core wrapTool works');
        expect(result.stdout).toContain('responses wrapTool works');
      });

      it('all packages work together', () => {
        expect(result.stdout).toContain('All packages work together!');
      });
    });
  },
});
