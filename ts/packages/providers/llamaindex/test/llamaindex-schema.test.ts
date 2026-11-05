/**
 * The schema the provider shows the model through LlamaIndex, and the
 * validation LlamaIndex runs on tool-call arguments.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Tool } from '@composio/core';
import { LlamaindexProvider } from '../src';
import {
  acceptedFor,
  loadObjectCases,
} from '../../../core/test/fixtures/json-schema-conversion/corpus';

type Json = Record<string, unknown>;
type Validator = { safeParse: (value: unknown) => { success: boolean } };

// The real `FunctionTool`, which also keeps the validator it was given so the
// tests can run it: LlamaIndex itself only logs a failed validation.
vi.mock('llamaindex', async importOriginal => {
  const actual = await importOriginal<typeof import('llamaindex')>();
  class InspectableFunctionTool extends actual.FunctionTool<unknown, string> {
    readonly validator: unknown;
    constructor(...args: ConstructorParameters<typeof actual.FunctionTool<unknown, string>>) {
      super(...args);
      this.validator = args[2];
    }
  }
  return { ...actual, FunctionTool: InspectableFunctionTool };
});

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

const wrap = (tool: Tool) =>
  new LlamaindexProvider().wrapTool(tool, async () => ({
    data: {},
    error: null,
    successful: true,
  }));

describe('LlamaindexProvider schema sent to the model', () => {
  it('sends the source schema, including keywords a Zod schema cannot carry', () => {
    const inputParameters = {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        hex: {
          type: 'string',
          contentEncoding: 'base16',
          contentMediaType: 'application/octet-stream',
        },
        page: { type: 'integer', default: 1 },
      },
      required: ['file'],
    };

    expect(wrap(buildTool(inputParameters)).metadata.parameters).toEqual(inputParameters);
  });

  it('removes duplicate required entries, including in inlined definitions', () => {
    const parameters = wrap(
      buildTool({
        type: 'object',
        properties: { query: { type: 'string' }, filter: { $ref: '#/$defs/Filter' } },
        required: ['query', 'query'],
        $defs: {
          Filter: {
            type: 'object',
            properties: { field: { type: 'string' } },
            required: ['field', 'field'],
          },
        },
      })
    ).metadata.parameters as Json;

    expect(parameters.required).toEqual(['query']);
    expect((parameters.properties as Record<string, Json>).filter.required).toEqual(['field']);
  });
});

describe('LlamaindexProvider tool-call validation', () => {
  for (const testCase of loadObjectCases()) {
    it(`matches the shared corpus on ${testCase.id}`, () => {
      const { validator } = wrap(buildTool(testCase.schema)) as unknown as {
        validator: Validator;
      };

      for (const instance of testCase.instances) {
        expect(validator.safeParse(instance.input).success, JSON.stringify(instance.input)).toBe(
          acceptedFor(instance, 'zod')
        );
      }
    });
  }

  it('passes the parsed arguments to the tool', async () => {
    const executeTool = vi.fn().mockResolvedValue({ data: {}, error: null, successful: true });
    const wrapped = new LlamaindexProvider().wrapTool(
      buildTool({
        type: 'object',
        properties: { query: { type: 'string' }, page: { type: 'integer', default: 1 } },
        required: ['query'],
      }),
      executeTool
    );

    await wrapped.call({ query: 'composio' });

    expect(executeTool).toHaveBeenCalledWith('TEST_TOOL', { query: 'composio', page: 1 });
  });
});
