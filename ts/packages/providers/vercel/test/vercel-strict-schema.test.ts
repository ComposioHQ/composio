/**
 * The schema strict mode sends to the model, rendered by the real AI SDK.
 *
 * The sibling suites mock `ai`, so they see the Zod schema the provider builds
 * but not the JSON Schema the AI SDK derives from it. Strict structured
 * outputs reject the whole request on a string `format` outside the accepted
 * list or a `pattern` they cannot compile, so these tests check the rendered
 * schema itself.
 */
import { asSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import type { Tool } from '@composio/core';
import { VercelProvider } from '../src';

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

const formatsTool = {
  slug: 'TEST_FORMATS_TOOL',
  name: 'Formats Tool',
  description: 'A tool whose string parameters carry formats',
  version: '20260901_00',
  availableVersions: ['20260901_00'],
  tags: [],
  inputParameters: {
    type: 'object',
    properties: {
      link: { type: 'string', format: 'uri' },
      repo: { type: 'string', format: 'repo.nwo' },
      file: { type: 'string', format: 'binary' },
      mail: { type: 'string', format: 'email' },
      when: { type: 'string', format: 'date-time' },
      id: { type: 'string', format: 'uuid' },
      links: { type: 'array', items: { type: 'string', format: 'uri' } },
    },
    required: ['link', 'mail'],
  },
} as unknown as Tool;

const render = async (tool: Tool, strict: boolean): Promise<Json> => {
  const wrapped = new VercelProvider({ strict }).wrapTool(tool, async () => ({
    data: {},
    error: null,
    successful: true,
  }));
  return (await asSchema(wrapped.inputSchema).jsonSchema) as Json;
};

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

describe('VercelProvider strict schema sent to the model', () => {
  it('carries only the string formats strict structured outputs accept', async () => {
    const formats = nodes(await render(formatsTool, true))
      .map(node => node.format)
      .filter(format => format !== undefined);

    expect(formats.length).toBeGreaterThan(0);
    for (const format of formats) {
      expect(STRICT_STRING_FORMATS).toContain(format);
    }
  });

  it('adds no pattern the source schema does not declare', async () => {
    const patterns = nodes(await render(formatsTool, true)).filter(node => 'pattern' in node);

    expect(patterns).toEqual([]);
  });
});
