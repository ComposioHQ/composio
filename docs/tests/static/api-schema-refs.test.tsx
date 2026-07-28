import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CustomSchemaUI } from '../../components/custom-schema-ui';
import { generateSchemaData } from '../../components/schema-generator';

type TestSchema = Parameters<typeof generateSchemaData>[0]['root'];
type TestSchemaObject = Exclude<TestSchema, boolean>;

// Reference Objects must be read through the document resolver while retaining
// their raw pointer as the stable schema identity.

const components: Record<string, TestSchemaObject> = {
  '#/components/schemas/User': {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'Unique user id' },
      nickname: { type: 'string', description: 'Display name' },
      secret: { type: 'string', writeOnly: true },
    },
  },
  '#/components/schemas/Address': {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
    },
  },
};

// Mirrors ctx.schema.resolve from fumadocs: shallowly resolves a Reference
// Object and merges sibling keywords; non-references pass through unchanged.
const resolve = (node: TestSchema): TestSchema => {
  if (typeof node !== 'object' || !node.$ref) return node;
  const { $ref, ...siblings } = node;
  if (typeof $ref !== 'string') return node;
  const target = components[$ref];
  return { ...target, ...siblings };
};

const getRawRef = (value: object): string | undefined =>
  '$ref' in value && typeof value.$ref === 'string' ? value.$ref : undefined;

const ctx = { renderMarkdown: (text: string) => text, schema: { getRawRef, resolve } };

describe('$ref resolution in generated API schemas', () => {
  test('renders properties for a root that is a Reference Object', () => {
    const generated = generateSchemaData(
      { root: { $ref: '#/components/schemas/User' }, readOnly: true },
      ctx
    );

    const html = renderToStaticMarkup(
      <CustomSchemaUI name="body" as="body" generated={generated} />
    );

    expect(html).toContain('id');
    expect(html).toContain('Unique user id');
    expect(html).toContain('nickname');
    expect(html).toContain('Display name');
  });

  test('resolves Reference Objects nested in properties', () => {
    const generated = generateSchemaData(
      {
        root: {
          type: 'object',
          properties: { address: { $ref: '#/components/schemas/Address' } },
        },
        readOnly: true,
      },
      ctx
    );

    const html = renderToStaticMarkup(
      <CustomSchemaUI name="body" as="body" generated={generated} />
    );

    expect(html).toContain('address');
    // The referenced object's own fields render inside a collapsed accordion,
    // so assert on the resolved shape rather than the nested description text:
    // an unresolved `$ref` would fall through to a primitive with no children.
    expect(html).toContain('Address');
    expect(html).toContain('Show 1 child attributes');
  });

  test('keeps the schema name as the display type for a Reference Object', () => {
    const generated = generateSchemaData(
      { root: { $ref: '#/components/schemas/User' }, readOnly: true },
      ctx
    );

    expect(generated.refs[generated.$root]?.typeName).toBe('User');
  });

  test('applies readOnly/writeOnly visibility through a Reference Object', () => {
    const generated = generateSchemaData(
      { root: { $ref: '#/components/schemas/User' }, readOnly: true },
      ctx
    );

    const html = renderToStaticMarkup(
      <CustomSchemaUI name="body" as="body" generated={generated} isResponse />
    );

    // `secret` is writeOnly, so it must not appear on a read-only (response) view.
    expect(html).not.toContain('secret');
  });

  test('dedupes repeated Reference Objects onto one entry', () => {
    const generated = generateSchemaData(
      {
        root: {
          type: 'object',
          properties: {
            primary: { $ref: '#/components/schemas/Address' },
            billing: { $ref: '#/components/schemas/Address' },
          },
        },
        readOnly: true,
      },
      ctx
    );

    expect(generated.refs['#/components/schemas/Address']).toBeDefined();
    expect(
      Object.keys(generated.refs).filter(key => key === '#/components/schemas/Address')
    ).toHaveLength(1);
  });
});
