import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import toolkitsJson from 'test/__mocks__/toolkits.json' with { type: 'json' };
import { toolkitsFromJSON } from 'src/models/toolkits';

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
