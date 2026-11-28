import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { dereferenceJsonSchema } from '@composio/core/utils/json-schema';
import { printTypeFromJsonSchema } from 'src/generation/typescript/json-schema-type';
import { removeDiscriminators } from 'src/generation/typescript/generate-type-from-json-schema';
import { printWithOpenApiTypeScript } from 'test/__utils__/openapi-typescript-oracle';
import { TOOLS_TYPES_GITHUB } from 'test/__mocks__/tools-types-github';
import { TOOLS_TYPES_GMAIL } from 'test/__mocks__/tools-types-gmail';
import { TOOLS_TYPES_GOOGLEDRIVE } from 'test/__mocks__/tools-types-googledrive';
import { TRIGGER_TYPES_GITHUB } from 'test/__mocks__/trigger-types-github';
import { TRIGGER_TYPES_GMAIL } from 'test/__mocks__/trigger-types-gmail';
import { TRIGGER_TYPES_GOOGLEDRIVE } from 'test/__mocks__/trigger-types-googledrive';
import notionAppendTextBlocks from 'test/__fixtures__/notion-append-text-blocks.json';
import notionCreateComment from 'test/__fixtures__/notion-create-comment.json';

/**
 * These tests hold `printTypeFromJsonSchema` to the output of openapi-typescript
 * and the TypeScript compiler's printer byte for byte, on recorded schemas and on
 * generated ones, wherever openapi-typescript accepted the schema.
 */
const expectSameOutput = async (name: string, properties: unknown) => {
  const expected = await printWithOpenApiTypeScript(name, properties);
  if (!expected.ok) return false;
  expect(printTypeFromJsonSchema(name, properties)).toBe(expected.text);
  return true;
};

const recorded: ReadonlyArray<readonly [string, unknown]> = (
  [
    ...[...TOOLS_TYPES_GITHUB, ...TOOLS_TYPES_GMAIL, ...TOOLS_TYPES_GOOGLEDRIVE].flatMap(
      tool =>
        [
          [`${tool.slug}_INPUT`, tool.input_parameters],
          [`${tool.slug}_OUTPUT`, tool.output_parameters],
        ] as const
    ),
    ...[...TRIGGER_TYPES_GITHUB, ...TRIGGER_TYPES_GMAIL, ...TRIGGER_TYPES_GOOGLEDRIVE].map(
      trigger => [`${trigger.slug}_PAYLOAD`, trigger.payload] as const
    ),
    ['NOTION_APPEND_TEXT_BLOCKS_INPUT', notionAppendTextBlocks.input_parameters],
    ['NOTION_CREATE_COMMENT_INPUT', notionCreateComment.input_parameters],
  ] satisfies ReadonlyArray<readonly [string, unknown]>
).map(
  // Prepared as `generateTypeFromJsonSchema` prepares them: local `$ref` pointers
  // inlined (openapi-typescript cannot resolve them), discriminators removed.
  ([name, schema]) =>
    [
      name,
      removeDiscriminators(
        (dereferenceJsonSchema(schema, { onUnresolved: 'sentinel' }) as { properties?: unknown })
          .properties
      ),
    ] as const
);

// Text that exercises the comment and string-literal printers: line breaks the
// compiler counts (CR, LF, CRLF, U+2028), indentation, comment terminators,
// non-ASCII characters, and quotes.
const text = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.constantFrom(
    'Title',
    ' padded ',
    'two\nlines',
    'crlf\r\nline',
    'lone\rcr',
    'sep\u2028arator',
    'tab\tbed\n\tindented',
    'ends */ here',
    'naïve café ✓ 🚀',
    'quote " and \\ backslash',
    '',
    '   '
  )
);

const key = fc.oneof(
  fc.constantFrom(
    'id',
    'name',
    '$defs',
    'parameters',
    'requestBody',
    '0',
    '12',
    '-1',
    'a-b',
    'é',
    'with space',
    '__proto_x'
  ),
  fc.string({ minLength: 1, maxLength: 6 })
);

const scalarValue = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.integer({ min: -5, max: 5 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null)
);

const { schema } = fc.letrec<{ schema: unknown; object: unknown }>(tie => ({
  schema: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(true),
    fc.constant(false),
    fc.record(
      {
        type: fc.oneof(
          fc.constantFrom('string', 'number', 'integer', 'boolean', 'null', 'array', 'object'),
          fc.uniqueArray(fc.constantFrom('string', 'number', 'null', 'object', 'array'), {
            minLength: 1,
            maxLength: 3,
          })
        ),
        title: text,
        description: text,
        summary: text,
        format: fc.constantFrom('date-time', 'uri', 'email'),
        deprecated: fc.boolean(),
        default: fc.oneof(scalarValue, fc.array(scalarValue, { maxLength: 2 })),
        example: scalarValue,
        examples: fc.array(fc.oneof(scalarValue, fc.dictionary(key, scalarValue, { maxKeys: 2 })), {
          maxLength: 2,
        }),
        enum: fc.array(scalarValue, { minLength: 1, maxLength: 4 }),
        const: scalarValue,
        nullable: fc.boolean(),
        readOnly: fc.boolean(),
        items: fc.oneof(tie('schema'), fc.array(tie('schema'), { maxLength: 2 })),
        prefixItems: fc.array(tie('schema'), { minLength: 1, maxLength: 2 }),
        anyOf: fc.array(tie('schema'), { minLength: 1, maxLength: 3 }),
        oneOf: fc.array(tie('schema'), { minLength: 1, maxLength: 3 }),
        allOf: fc.array(tie('object'), { minLength: 1, maxLength: 2 }),
        properties: fc.dictionary(key, tie('schema'), { maxKeys: 3 }),
        required: fc.array(key, { maxLength: 2 }),
        additionalProperties: fc.oneof(fc.boolean(), fc.constant({}), tie('schema')),
        $defs: fc.dictionary(key, tie('object'), { maxKeys: 2 }),
      },
      { requiredKeys: [] }
    )
  ),
  object: fc.record(
    {
      type: fc.constant('object'),
      title: text,
      properties: fc.dictionary(key, tie('schema'), { maxKeys: 3 }),
      required: fc.array(key, { maxLength: 2 }),
    },
    { requiredKeys: ['type'] }
  ),
}));

describe('printTypeFromJsonSchema', () => {
  it.each(recorded)('prints %s as openapi-typescript did', async (name, properties) => {
    expect(await expectSameOutput(name, properties)).toBe(true);
  });

  it('prints generated schemas as openapi-typescript did', async () => {
    let compared = 0;
    await fc.assert(
      fc.asyncProperty(fc.dictionary(key, schema, { maxKeys: 4 }), async properties => {
        if (await expectSameOutput('GENERATED', properties)) compared++;
      }),
      { numRuns: 400, seed: 20261126 }
    );
    // Most generated schemas pass openapi-typescript's lint, so most runs compare.
    expect(compared).toBeGreaterThan(200);
  }, 120_000);

  it('prints an object with no properties as object', () => {
    expect(printTypeFromJsonSchema('EMPTY', undefined)).toBe('type EMPTY = object;');
    expect(printTypeFromJsonSchema('EMPTY', {})).toBe('type EMPTY = object;');
  });

  it('prints a reference as unknown instead of failing', () => {
    expect(printTypeFromJsonSchema('REF', { body: { $ref: '#/$defs/Body' } })).toBe(
      'type REF = {\n  body?: unknown;\n};'
    );
  });

  it('rejects a schema that is not an object or a boolean, as openapi-typescript did', () => {
    expect(() => printTypeFromJsonSchema('BAD', { field: 'string' })).toThrow(
      /invalid property field/
    );
  });

  it('rejects a type name that is not an identifier', () => {
    expect(() => printTypeFromJsonSchema('GMAIL_X = string; run(); type Y_INPUT', {})).toThrow(
      /is not a valid TypeScript type name/
    );
  });
});
