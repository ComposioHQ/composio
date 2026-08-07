import { describe, expect, test } from 'bun:test';

import { DOCS_BENCHMARK_SCENARIOS } from '../../evals/docs-benchmark/scenarios';

describe('docs benchmark scenarios', () => {
  test('keeps a broad, uniquely identified scenario set', () => {
    const ids = DOCS_BENCHMARK_SCENARIOS.map(scenario => scenario.id);

    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(DOCS_BENCHMARK_SCENARIOS.map(scenario => scenario.category))).toEqual(
      new Set(['start-and-route', 'find-and-change', 'build-examples', 'legacy-and-safety'])
    );
  });

  test('encodes plugin and CLI preference separately from explicit MCP intent', () => {
    const preferred = DOCS_BENCHMARK_SCENARIOS.filter(scenario =>
      ['claude-code-default', 'terminal-cli', 'codex-without-mcp'].includes(scenario.id)
    );
    const explicitMcp = DOCS_BENCHMARK_SCENARIOS.filter(scenario =>
      ['cursor-explicit-mcp', 'generic-mcp-client', 'application-session-mcp'].includes(scenario.id)
    );

    for (const scenario of preferred) {
      expect(scenario.forbiddenRoutes).toContain('/docs/composio-connect');
    }
    expect(explicitMcp.map(scenario => scenario.expectedRoutes[0])).toEqual([
      '/docs/composio-connect',
      '/docs/composio-connect',
      '/docs/sessions-via-mcp',
    ]);
  });

  test('keeps every scored prompt reviewable', () => {
    for (const scenario of DOCS_BENCHMARK_SCENARIOS) {
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.prompt.length).toBeGreaterThan(20);
      expect(scenario.expectedContent.length).toBeGreaterThan(0);
    }
  });
});
