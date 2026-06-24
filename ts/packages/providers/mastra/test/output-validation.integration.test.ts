import { describe, it, expect } from 'vitest';
import { applyCompatLayer, convertSchemaToZod } from '@mastra/schema-compat';
import { relaxOutputSchema } from '../src/relax-output-schema';

/**
 * Integration regression test for issue #3047.
 *
 * `mastra.test.ts` mocks `@mastra/schema-compat`, so it verifies *that*
 * `wrapTool` relaxes the output schema but never exercises the real validation.
 * This test runs the full production chain instead — the same one `wrapTool`
 * drives at tool-execution time:
 *
 *   relaxOutputSchema → applyCompatLayer(mode: 'jsonSchema') → convertSchemaToZod → parse
 *
 * `convertSchemaToZod` is the JSON-Schema → Zod conversion Mastra performs
 * internally before `validateToolOutput` checks a tool result. The test proves
 * that the relaxation makes a real third-party API response (with `null`
 * optional fields and extra keys) survive validation instead of being dropped
 * and replaced by an error — and that no data is truncated in the process.
 *
 * See https://github.com/ComposioHQ/composio/issues/3047.
 */

// A strict Composio-style output schema: optional fields typed as non-nullable
// primitives, objects closed with `additionalProperties: false` — exactly the
// shape the Composio API emits for connector tools.
const STRICT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        avatarUrl: { type: 'string' },
        description: { type: 'string' },
        assignee: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string' } },
        },
      },
    },
  },
};

// A realistic third-party response: `null` for unset optional fields plus an
// unexpected extra key — what Linear / Notion / Jira / Slack actually return.
const REAL_API_PAYLOAD = {
  data: {
    id: 'iss_123',
    title: 'Fix the thing',
    avatarUrl: null,
    description: null,
    assignee: null,
    unexpectedExtraKey: 'present',
  },
};

/** Mirror of the validation Mastra runs on a tool result. */
function compileForValidation(schema: object) {
  const jsonSchema = applyCompatLayer({ schema, compatLayers: [], mode: 'jsonSchema' });
  return convertSchemaToZod(jsonSchema as object);
}

describe('Mastra output validation against real schema-compat (issue #3047)', () => {
  it('documents the bug: the strict schema rejects null optional fields', () => {
    const validator = compileForValidation(STRICT_OUTPUT_SCHEMA);
    const result = validator.safeParse(REAL_API_PAYLOAD);
    // Without the relaxation Mastra would drop this data and substitute an error.
    expect(result.success).toBe(false);
  });

  it('relaxed schema accepts the payload, preserving null values and extra keys', () => {
    const validator = compileForValidation(relaxOutputSchema(STRICT_OUTPUT_SCHEMA));
    const result = validator.safeParse(REAL_API_PAYLOAD);

    expect(result.success).toBe(true);
    // Nothing is truncated: nulls and the extra key survive untouched.
    expect(result.data).toEqual(REAL_API_PAYLOAD);
  });

  it('relaxed schema lets an enum field return null, but still rejects bogus values', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { status: { type: 'string', enum: ['open', 'closed'] } },
    };
    const strict = compileForValidation(schema);
    const relaxed = compileForValidation(relaxOutputSchema(schema));

    expect(strict.safeParse({ status: null }).success).toBe(false); // the gap
    expect(relaxed.safeParse({ status: null }).success).toBe(true); // fixed
    expect(relaxed.safeParse({ status: 'open' }).success).toBe(true); // still valid
    expect(relaxed.safeParse({ status: 'nope' }).success).toBe(false); // still constrained
  });

  it('relaxed schema accepts a response that omits a required field', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'title'],
      properties: { id: { type: 'string' }, title: { type: 'string' } },
    };
    const strict = compileForValidation(schema);
    const relaxed = compileForValidation(relaxOutputSchema(schema));

    expect(strict.safeParse({ id: 'iss_1' }).success).toBe(false); // the gap
    expect(relaxed.safeParse({ id: 'iss_1' }).success).toBe(true); // fixed
  });

  it('never narrows validation through a `not` keyword', () => {
    const schema = { not: { type: 'string' } }; // "must not be a string" — null is valid
    const strict = compileForValidation(schema);
    const relaxed = compileForValidation(relaxOutputSchema(schema));

    // Relaxing `not`'s subschema would make these previously-valid values fail.
    expect(strict.safeParse(null).success).toBe(true);
    expect(relaxed.safeParse(null).success).toBe(true); // still valid, not narrowed
    expect(relaxed.safeParse(42).success).toBe(true); // still valid
    expect(relaxed.safeParse('str').success).toBe(false); // constraint preserved
  });
});
