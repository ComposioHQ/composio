import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

describe('CLI: composio toolkits', () => {
  const toolkitsData = {
    toolkits: makeTestToolkits([
      { name: 'Gmail', slug: 'gmail' },
      { name: 'GitHub', slug: 'github' },
    ]),
    tools: [...TOOLS_TYPES_GMAIL.slice(0, 3), ...TOOLS_TYPES_GITHUB.slice(0, 2)],
    triggerTypes: [...TRIGGER_TYPES_GMAIL.slice(0, 1), ...TRIGGER_TYPES_GITHUB.slice(0, 1)],
    triggerTypesAsEnums: [
      ...TRIGGER_TYPES_GMAIL.slice(0, 1).map(item => item.slug),
      ...TRIGGER_TYPES_GITHUB.slice(0, 1).map(item => item.slug),
    ],
  } satisfies TestLiveInput['toolkitsData'];

  layer(
    TestLive({
      toolkitsData,
    })
  )(it => {
    it.scoped('lists available toolkits', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'list', '--limit', '10']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Listing');
        expect(output).toContain('gmail');
        expect(output).toContain('github');
      })
    );

    it.scoped('searches toolkits by query', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'search', 'mail']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Found');
        expect(output).toContain('gmail');
      })
    );

    it.scoped('shows toolkit details', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'info', 'gmail']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Name: Gmail');
        expect(output).toContain('Fields Required for AuthConfig and Connected Account creation');
        expect(output).toContain('Available Versions:');
      })
    );

    it.scoped('shows toolkit details as json', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'info', '--json', 'gmail']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('"slug": "gmail"');
      })
    );
  });
});
