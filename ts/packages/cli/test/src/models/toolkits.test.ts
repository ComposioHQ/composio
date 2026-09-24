import { describe, expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import toolkitsJson from 'test/__mocks__/toolkits.json' with { type: 'json' };
import { Toolkits, toolkitsFromJSON, toolkitsToJSON } from 'src/models/toolkits';

describe('ToolkitSlug', () => {
  it.effect(
    '[Given] cached toolkit data with underscore-prefixed slugs [Then] it decodes successfully',
    Effect.fn(function* () {
      const toolkits = yield* toolkitsFromJSON(JSON.stringify(toolkitsJson));

      expect(toolkits.map(toolkit => toolkit.slug)).toEqual(
        expect.arrayContaining(['_21risk', '_2chat'])
      );
    })
  );
});

describe('Toolkit', () => {
  const meta = {
    description: 'Project custom toolkit',
    categories: [],
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-02T00:00:00.000Z',
    logo: '',
    tools_count: 2,
    triggers_count: 0,
    version: '20250101_00',
  };

  it.effect(
    '[Given] a project custom toolkit without auth fields [Then] it decodes with empty auth defaults',
    Effect.fn(function* () {
      const [toolkit] = yield* Schema.decodeUnknownEffect(Toolkits)([
        {
          slug: 'custom_grain',
          name: 'Grain',
          type: 'custom',
          is_local_toolkit: false,
          deprecated: false,
          meta,
        },
      ]);

      expect(toolkit.slug).toBe('custom_grain');
      expect(toolkit.auth_schemes).toEqual([]);
      expect(toolkit.composio_managed_auth_schemes).toEqual([]);
      expect(toolkit.no_auth).toBe(false);
    })
  );

  it.effect(
    '[Given] a native toolkit with auth fields [Then] it keeps the provided values',
    Effect.fn(function* () {
      const [toolkit] = yield* Schema.decodeUnknownEffect(Toolkits)([
        {
          slug: 'gmail',
          name: 'Gmail',
          is_local_toolkit: false,
          auth_schemes: ['OAUTH2', 'BEARER_TOKEN'],
          composio_managed_auth_schemes: ['OAUTH2'],
          no_auth: true,
          meta,
        },
      ]);

      expect(toolkit.auth_schemes).toEqual(['OAUTH2', 'BEARER_TOKEN']);
      expect(toolkit.composio_managed_auth_schemes).toEqual(['OAUTH2']);
      expect(toolkit.no_auth).toBe(true);
    })
  );

  it.effect(
    '[Given] decoded toolkits including a defaulted custom toolkit [Then] the JSON cache round-trip keeps values',
    Effect.fn(function* () {
      const toolkits = yield* Schema.decodeUnknownEffect(Toolkits)([
        { slug: 'custom_grain', name: 'Grain', is_local_toolkit: false, meta },
        {
          slug: 'gmail',
          name: 'Gmail',
          is_local_toolkit: false,
          auth_schemes: ['OAUTH2'],
          composio_managed_auth_schemes: ['OAUTH2'],
          no_auth: false,
          meta,
        },
      ]);

      const roundTripped = yield* toolkitsFromJSON(yield* toolkitsToJSON(toolkits));

      expect(roundTripped).toEqual(toolkits);
      expect(roundTripped[0]?.auth_schemes).toEqual([]);
      expect(roundTripped[0]?.no_auth).toBe(false);
      expect(roundTripped[1]?.auth_schemes).toEqual(['OAUTH2']);
    })
  );
});
