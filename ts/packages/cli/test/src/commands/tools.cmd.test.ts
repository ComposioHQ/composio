import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

describe('CLI: composio tools', () => {
  const toolkitsData = {
    toolkits: makeTestToolkits([{ name: 'GitHub', slug: 'github' }]),
    tools: [...TOOLS_TYPES_GITHUB.slice(0, 5)],
    triggerTypes: [...TRIGGER_TYPES_GITHUB.slice(0, 2)],
    triggerTypesAsEnums: [...TRIGGER_TYPES_GITHUB.slice(0, 2).map(item => item.slug)],
  } satisfies TestLiveInput['toolkitsData'];

  layer(
    TestLive({
      toolkitsData,
    })
  )(it => {
    it.scoped('lists tools filtered by toolkit', () =>
      Effect.gen(function* () {
        yield* cli(['tools', 'list', '--toolkits', 'github', '--limit', '3']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Fetched 3 tools from github');
        expect(output).toContain('GITHUB_');
      })
    );

    it.scoped('searches tools by query', () =>
      Effect.gen(function* () {
        yield* cli(['tools', 'search', '--toolkits', 'github', 'issue']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain('Found');
        expect(output).toContain('GITHUB_');
      })
    );

    it.scoped('shows tool info with schema', () =>
      Effect.gen(function* () {
        const tool = TOOLS_TYPES_GITHUB[0]!;
        yield* cli(['tools', 'info', tool.slug]);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');

        expect(output).toContain(`Slug: ${tool.slug}`);
        expect(output).toContain('Input Schema:');
        expect(output).toContain('Output Schema:');
      })
    );

    it.scoped('executes tool with json params', () =>
      Effect.gen(function* () {
        const tool = TOOLS_TYPES_GITHUB[0]!;
        yield* cli([
          'tools',
          'execute',
          '--user_id',
          'user_123',
          '--params',
          '{"subject":"hello"}',
          tool.slug,
        ]);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('200 Execute the tool');
        expect(output).toContain(`"tool_slug": "${tool.slug}"`);
      })
    );
  });
});
