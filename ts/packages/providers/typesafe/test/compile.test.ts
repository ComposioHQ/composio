import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TypesafeDuplicateToolError, TypesafeProvider } from '../src';
import { routingQuestion } from '../src/compile';
import { buildOptions, optionValues } from '../src/keys';
import { corpus, makeTool } from './helpers';

const provider = new TypesafeProvider();

// The Python SDK compiles the same corpus, so both SDKs ask Jev the same questions.
describe('question corpus', () => {
  it.each(corpus.tools.map(entry => [entry.name, entry] as const))(
    'compiles %s to its expected questions',
    (_name, entry) => {
      expect(provider.wrapTool(entry.tool)).toEqual(entry.expected);
    }
  );

  it.each(corpus.sets.map(set => [set.name, set] as const))(
    'builds the routing Choice for %s',
    (_name, set) => {
      const tools = set.tools.map(tool =>
        typeof tool === 'string'
          ? provider.wrapTool(corpus.tools.find(entry => entry.tool.slug === tool)!.tool)
          : tool
      );
      expect(routingQuestion(tools)).toEqual(set.expected);
    }
  );
});

describe('wrapTools', () => {
  it('returns an empty tool set for no tools and throws on duplicate slugs', () => {
    expect(provider.wrapTools([])).toEqual({ tools: [] });
    expect(() => provider.wrapTools([makeTool('SAME'), makeTool('SAME')])).toThrow(
      TypesafeDuplicateToolError
    );
  });
});

describe('option keys', () => {
  it('round-trips arbitrary string enums from option key to original value', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string(), { minLength: 1, maxLength: 40 }), labels => {
        const options = buildOptions(labels);
        const keys = options.map(option => option.key);
        expect(new Set(keys).size).toBe(labels.length);
        expect(keys.some(key => key.startsWith('__'))).toBe(false);
        // Object key order is the declared order: no key looks numeric.
        expect(Object.keys(Object.fromEntries(keys.map(key => [key, ''])))).toEqual(keys);
        const restored = optionValues(options);
        expect(keys.map(key => restored.get(key))).toEqual(labels);
      })
    );
  });
});
