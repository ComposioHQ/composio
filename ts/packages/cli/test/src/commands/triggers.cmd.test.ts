import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

describe('CLI: composio triggers', () => {
  const toolkitsData = {
    toolkits: makeTestToolkits([{ name: 'GitHub', slug: 'github' }]),
    tools: [...TOOLS_TYPES_GITHUB.slice(0, 2)],
    triggerTypes: [...TRIGGER_TYPES_GITHUB.slice(0, 4)],
    triggerTypesAsEnums: [...TRIGGER_TYPES_GITHUB.slice(0, 4).map(item => item.slug)],
  } satisfies TestLiveInput['toolkitsData'];

  const entitiesData = {
    triggerInstances: [
      {
        id: 'ti_1',
        trigger_name: TRIGGER_TYPES_GITHUB[0]!.slug,
        connected_account_id: 'ca_1',
        user_id: 'user_1',
        trigger_config: { interval: '5m' },
        disabled_at: null,
      },
      {
        id: 'ti_2',
        trigger_name: TRIGGER_TYPES_GITHUB[1]!.slug,
        connected_account_id: 'ca_1',
        user_id: 'user_1',
        trigger_config: { interval: '10m' },
        disabled_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  } satisfies TestLiveInput['entitiesData'];

  layer(
    TestLive({
      toolkitsData,
      entitiesData,
    })
  )(it => {
    it.scoped('lists trigger types', () =>
      Effect.gen(function* () {
        yield* cli(['triggers', 'list', '--toolkits', 'github', '--query', 'github']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Found');
        expect(output).toContain('GITHUB_');
      })
    );

    it.scoped('shows trigger type details', () =>
      Effect.gen(function* () {
        const triggerSlug = TRIGGER_TYPES_GITHUB[0]!.slug;
        yield* cli(['triggers', 'info', triggerSlug]);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`Slug: ${triggerSlug}`);
        expect(output).toContain('Fields:');
      })
    );

    it.scoped('creates trigger instance', () =>
      Effect.gen(function* () {
        const triggerSlug = TRIGGER_TYPES_GITHUB[0]!.slug;
        yield* cli([
          'triggers',
          'create',
          '--connected_account',
          'ca_1',
          '--config',
          '{"interval":"1m"}',
          triggerSlug,
        ]);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Trigger created/updated successfully');
        expect(output).toContain('"trigger_id"');
      })
    );

    it.scoped('shows trigger statuses with filters', () =>
      Effect.gen(function* () {
        yield* cli([
          'triggers',
          'status',
          '--connected_accounts',
          'ca_1',
          '--user_ids',
          'user_1',
          '--statuses',
          'active',
        ]);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Found 1 trigger instances');
        expect(output).toContain('ACTIVE');
      })
    );

    it.scoped('inspects trigger instance', () =>
      Effect.gen(function* () {
        yield* cli(['triggers', 'inspect', 'ti_1']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Id: ti_1');
        expect(output).toContain('Status: ACTIVE');
      })
    );

    it.scoped('manages trigger lifecycle', () =>
      Effect.gen(function* () {
        yield* cli(['triggers', 'enable', 'ti_2']);
        yield* cli(['triggers', 'disable', 'ti_1']);
        yield* cli(['triggers', 'delete', 'ti_1']);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('Enabled trigger ti_2');
        expect(output).toContain('Disabled trigger ti_1');
        expect(output).toContain('Deleted trigger ti_1');
      })
    );
  });
});
