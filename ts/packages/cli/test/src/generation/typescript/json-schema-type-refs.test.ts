import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import {
  generateTypeFromJsonSchema,
  removeDiscriminators,
} from 'src/generation/typescript/generate-type-from-json-schema';
import { printWithOpenApiTypeScript } from 'test/__utils__/openapi-typescript-oracle';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';

type Schema = { readonly [x: string]: unknown };

const recorded = [...TOOLS_TYPES_GMAIL, ...TOOLS_TYPES_GITHUB].flatMap(
  tool =>
    [
      [`${tool.slug}_INPUT`, tool.input_parameters],
      [`${tool.slug}_OUTPUT`, tool.output_parameters],
    ] as ReadonlyArray<readonly [string, Schema]>
);
const withRefs = recorded.filter(([, schema]) => JSON.stringify(schema).includes('"$ref"'));
const named = (names: ReadonlyArray<string>) =>
  names.map(name => recorded.find(([recordedName]) => recordedName === name)!);
const SAMPLES = named([
  'GMAIL_ADD_LABEL_TO_EMAIL_INPUT',
  'GMAIL_ADD_LABEL_TO_EMAIL_OUTPUT',
  'GITHUB_ABORT_REPOSITORY_MIGRATION_OUTPUT',
  'GITHUB_GET_THE_ZEN_OF_GITHUB_OUTPUT',
]);

describe('generateTypeFromJsonSchema with $ref', () => {
  it('has recorded Gmail and GitHub outputs that reference their $defs', () => {
    expect(withRefs.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'GMAIL_ADD_LABEL_TO_EMAIL_OUTPUT',
        'GITHUB_ABORT_REPOSITORY_MIGRATION_OUTPUT',
      ])
    );
  });

  it.each(withRefs)(
    '%s: openapi-typescript could not resolve its references',
    async (name, schema) => {
      const result = await printWithOpenApiTypeScript(
        name,
        removeDiscriminators(schema['properties'])
      );
      expect(result.ok).toBe(false);
      expect(String(!result.ok && result.error)).toMatch(/Can't resolve \$ref/);
    }
  );

  it.effect('prints recorded schemas with their references inlined', () =>
    Effect.gen(function* () {
      const printed = yield* Effect.all(
        SAMPLES.map(([name, schema]) =>
          generateTypeFromJsonSchema(name, schema).pipe(Effect.map(text => [name, text] as const))
        )
      );
      printed.forEach(([name, text]) => {
        expect(text).not.toContain('?: unknown;');
        expect(text).toMatchSnapshot(name);
      });
    })
  );

  it.effect('types the data of a recorded Gmail output', () =>
    Effect.gen(function* () {
      const [name, schema] = SAMPLES[1]!;
      const printed = yield* generateTypeFromJsonSchema(name, schema);
      expect(printed).toContain('labelIds?: string[];');
    })
  );

  it.effect('types a reference back into its own definition as an open object', () =>
    Effect.gen(function* () {
      const printed = yield* generateTypeFromJsonSchema('TREE', {
        $defs: {
          Node: {
            type: 'object',
            properties: { name: { type: 'string' }, child: { $ref: '#/$defs/Node' } },
          },
        },
        properties: { root: { $ref: '#/$defs/Node' } },
      });
      expect(printed).toContain('name?: string;');
      expect(printed).not.toContain('child?: unknown;');
      expect(printed).toContain('[key: string]: unknown;');
    })
  );

  it.effect('keeps unknown for an external reference and marks a missing one as unresolved', () =>
    Effect.gen(function* () {
      const printed = yield* generateTypeFromJsonSchema('REFS', {
        $defs: {},
        properties: {
          missing: { $ref: '#/$defs/Missing' },
          external: { $ref: 'https://example.com/schema.json' },
        },
      });
      expect(printed).toContain('external?: unknown;');
      expect(printed).toContain('Schema shape unresolved at the source');
    })
  );

  it.effect('resolves escaped pointers, legacy definitions, and references in allOf', () =>
    Effect.gen(function* () {
      const printed = yield* generateTypeFromJsonSchema('MIXED', {
        definitions: {
          'a/b~c': { type: 'string' },
          Base: { type: 'object', properties: { id: { type: 'number' } } },
        },
        properties: {
          escaped: { $ref: '#/definitions/a~1b~0c' },
          merged: { allOf: [{ $ref: '#/definitions/Base' }] },
        },
      });
      expect(printed).toContain('escaped?: string;');
      expect(printed).toContain('id?: number;');
    })
  );
});
