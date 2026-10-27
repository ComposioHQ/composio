/**
 * The schema the provider shows the model, rendered by the real AI SDK, and
 * the validation the AI SDK runs on tool-call arguments.
 *
 * The sibling suites mock `tool()`, so they see what the provider passes but
 * not the JSON Schema the AI SDK sends. These tests check that schema itself:
 * the source keywords reach the model, and strict mode sends only what strict
 * structured outputs accept.
 */
import { asSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import type { Tool } from '@composio/core';
import { VercelProvider } from '../src';
import {
  acceptedFor,
  loadObjectCases,
} from '../../../core/test/fixtures/json-schema-conversion/corpus';

type Json = Record<string, unknown>;

const STRICT_STRING_FORMATS = [
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
];

const buildTool = (inputParameters: Json): Tool =>
  ({
    slug: 'TEST_TOOL',
    name: 'Test Tool',
    description: 'A tool under test',
    version: '20260901_00',
    availableVersions: ['20260901_00'],
    tags: [],
    inputParameters,
  }) as unknown as Tool;

const annotatedTool = buildTool({
  type: 'object',
  properties: {
    file: { type: 'string', format: 'binary', title: 'File' },
    hex: {
      type: 'string',
      contentEncoding: 'base16',
      contentMediaType: 'application/octet-stream',
    },
    link: { type: 'string', format: 'uri' },
    mail: { type: 'string', format: 'email' },
    when: { type: 'string', format: 'date-time' },
    links: { type: 'array', items: { type: 'string', format: 'uri' } },
  },
  required: ['file', 'mail'],
});

const wrap = (tool: Tool, strict: boolean) =>
  asSchema(
    new VercelProvider({ strict }).wrapTool(tool, async () => ({
      data: {},
      error: null,
      successful: true,
    })).inputSchema
  );

const render = async (tool: Tool, strict: boolean): Promise<Json> =>
  (await wrap(tool, strict).jsonSchema) as Json;

/** Every schema node of `schema`, including nested properties, items, and branches. */
const nodes = (schema: unknown): Json[] => {
  if (typeof schema !== 'object' || schema === null) return [];
  if (Array.isArray(schema)) return schema.flatMap(nodes);
  const node = schema as Json;
  return [
    node,
    ...Object.values((node.properties as Json | undefined) ?? {}).flatMap(nodes),
    ...nodes(node.items),
    ...nodes(node.anyOf),
    ...nodes(node.oneOf),
    ...nodes(node.allOf),
  ];
};

describe('VercelProvider schema sent to the model', () => {
  it('sends the source keywords a Zod schema cannot carry', async () => {
    const properties = (await render(annotatedTool, false)).properties as Record<string, Json>;

    expect(properties.file).toEqual({ type: 'string', format: 'binary', title: 'File' });
    expect(properties.hex).toEqual({
      type: 'string',
      contentEncoding: 'base16',
      contentMediaType: 'application/octet-stream',
    });
    expect(properties.mail).toEqual({ type: 'string', format: 'email' });
  });

  it('carries only the string formats strict structured outputs accept under strict mode', async () => {
    const schema = await render(annotatedTool, true);
    const properties = schema.properties as Record<string, Json>;
    const formats = nodes(schema)
      .map(node => node.format)
      .filter(format => format !== undefined);

    expect(properties.link).not.toHaveProperty('format');
    expect(properties.file).not.toHaveProperty('format');
    expect(properties.mail).toMatchObject({ format: 'email' });
    expect(properties.hex).toMatchObject({
      contentEncoding: 'base16',
      contentMediaType: 'application/octet-stream',
    });
    for (const format of formats) {
      expect(STRICT_STRING_FORMATS).toContain(format);
    }
  });

  it('adds no pattern the source schema does not declare under strict mode', async () => {
    const patterns = nodes(await render(annotatedTool, true)).filter(node => 'pattern' in node);

    expect(patterns).toEqual([]);
  });
});

describe('VercelProvider tool-call validation', () => {
  for (const testCase of loadObjectCases()) {
    it(`matches the shared corpus on ${testCase.id}`, async () => {
      const schema = wrap(buildTool(testCase.schema), false);

      for (const instance of testCase.instances) {
        const result = await schema.validate!(instance.input);
        expect(result.success, JSON.stringify(instance.input)).toBe(acceptedFor(instance, 'zod'));
      }
    });
  }
});
