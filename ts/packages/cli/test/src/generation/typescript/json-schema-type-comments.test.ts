import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { generateTypeFromJsonSchema } from 'src/generation/typescript/generate-type-from-json-schema';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';

type Schema = { readonly [x: string]: unknown };

const recorded: ReadonlyArray<readonly [string, Schema]> = [
  ...[...TOOLS_TYPES_GMAIL, ...TOOLS_TYPES_GITHUB].flatMap(
    tool =>
      [
        [`${tool.slug}_INPUT`, tool.input_parameters],
        [`${tool.slug}_OUTPUT`, tool.output_parameters],
      ] as const
  ),
  ...[...TRIGGER_TYPES_GMAIL, ...TRIGGER_TYPES_GITHUB].map(
    trigger => [`${trigger.slug}_PAYLOAD`, trigger.payload as Schema] as const
  ),
];

/** Every `/** … *\/` block, with the line break that ends it. */
const withoutDocComments = (text: string) => text.replace(/^[ \t]*\/\*\*[\s\S]*?\*\/\n/gm, '');

describe('generateTypeFromJsonSchema with comments: false', () => {
  it.effect('prints the recorded schemas as with comments, minus every doc comment', () =>
    Effect.gen(function* () {
      const printed = yield* Effect.all(
        recorded.map(([name, schema]) =>
          Effect.all([
            generateTypeFromJsonSchema(name, schema),
            generateTypeFromJsonSchema(name, schema, { comments: false }),
          ]).pipe(Effect.map(([withComments, without]) => ({ withComments, without })))
        )
      );
      expect(
        printed.filter(({ withComments }) => withComments.includes('/**')).length
      ).toBeGreaterThan(0);
      expect(printed.filter(({ without }) => without.includes('/*'))).toEqual([]);
      expect(
        printed.filter(({ withComments, without }) => withoutDocComments(withComments) !== without)
      ).toEqual([]);
    })
  );
});
