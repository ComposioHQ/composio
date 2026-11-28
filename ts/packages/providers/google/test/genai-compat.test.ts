import { describe, it, expect, vi } from 'vitest';
import { GoogleGenAI, type FunctionCall, type FunctionDeclaration } from '@google/genai';
import type { Tool } from '@composio/core';
import { GoogleProvider } from '../src';

const tool: Tool = {
  slug: 'GET_WEATHER',
  name: 'Get weather',
  description: 'Get the current weather for a city',
  inputParameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
  tags: [],
};

function makeProvider() {
  const provider = new GoogleProvider();
  const execute = vi.fn().mockResolvedValue({ data: { temp: 21 }, error: null, successful: true });
  provider._setExecuteToolFn(execute);
  return { provider, execute };
}

describe('@google/genai compatibility', () => {
  it('wrapTool output is a FunctionDeclaration', () => {
    const declaration: FunctionDeclaration = makeProvider().provider.wrapTool(tool);
    expect(declaration.name).toBe('GET_WEATHER');
    expect(declaration.parametersJsonSchema).toMatchObject({ type: 'object', required: ['city'] });
  });

  it('executeToolCall accepts the SDK FunctionCall type', async () => {
    const { provider, execute } = makeProvider();
    const call: FunctionCall = { name: 'GET_WEATHER', args: { city: 'Rome' } };
    if (!call.name || !call.args) {
      throw new Error('Expected function call with name and args');
    }
    const result = await provider.executeToolCall('user_1', {
      name: call.name,
      args: call.args,
    });
    expect(JSON.parse(result)).toEqual({ data: { temp: 21 }, error: null, successful: true });
    expect(execute).toHaveBeenCalledOnce();
  });
});

// Runs only when GEMINI_API_KEY is set, e.g. `keyshroud run --only GEMINI_API_KEY -- pnpm test`.
describe.skipIf(!process.env.GEMINI_API_KEY)('live Gemini API', () => {
  it('accepts the wrapped declaration and returns a function call', async () => {
    const { provider } = makeProvider();
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-4-neon',
      contents: 'What is the weather in Rome? Use the tool.',
      config: { tools: [{ functionDeclarations: provider.wrapTools([tool]) }] },
    });
    const call = response.functionCalls?.[0];
    expect(call?.name).toBe('GET_WEATHER');
    if (!call?.name) {
      throw new Error('Expected function call with name');
    }
    const result = await provider.executeToolCall('user_1', {
      name: call.name,
      args: call.args ?? {},
    });
    expect(JSON.parse(result).successful).toBe(true);
  }, 60_000);
});
