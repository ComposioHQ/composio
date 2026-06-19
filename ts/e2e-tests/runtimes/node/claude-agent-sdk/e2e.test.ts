import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    ANTHROPIC_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: { node: ['current'] },
  usesFixtures: true,
  env: {
    ANTHROPIC_API_KEY: Bun.env.ANTHROPIC_API_KEY,
  },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'index.mjs' });
    }, TIMEOUTS.LLM_LONG);

    describe('@composio/claude-agent-sdk on current Node.js', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('executes the wrapped tool through Claude Agent SDK MCP', () => {
        expect(result.stdout).toContain('claude query executed wrapped tool');
      });
    });
  },
});
