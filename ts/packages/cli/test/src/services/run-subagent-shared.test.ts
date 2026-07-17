import { describe, expect, it } from 'vitest';
import { finalizeInvokeAgentText, parseJson } from 'src/services/run-subagent-shared';

describe('run-subagent-shared JSON probes', () => {
  describe('parseJson', () => {
    it('[Given] blank text [Then] returns undefined', () => {
      expect(parseJson('   ')).toBeUndefined();
    });

    it('[Given] valid JSON [Then] returns the parsed value', () => {
      expect(parseJson(' {"a": 1} ')).toEqual({ a: 1 });
      expect(parseJson('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(parseJson('null')).toBeNull();
    });

    it('[Given] non-JSON text [Then] returns the trimmed text verbatim', () => {
      expect(parseJson('  not json at all  ')).toBe('not json at all');
    });
  });

  describe('finalizeInvokeAgentText structured extraction', () => {
    const options = { structuredSchema: { type: 'object' } as Record<string, unknown> };

    it('[Given] direct JSON output [Then] parses it as the structured output', () => {
      expect(finalizeInvokeAgentText('{"a": 1}', options)).toEqual({
        result: null,
        structuredOutput: { a: 1 },
      });
    });

    it('[Given] a status line before a fenced JSON block [Then] extracts the fenced payload', () => {
      const text = 'Analysis complete.\n```json\n{"b": 2}\n```';
      expect(finalizeInvokeAgentText(text, options)).toEqual({
        result: null,
        structuredOutput: { b: 2 },
      });
    });

    it('[Given] JSON embedded in prose [Then] extracts the balanced payload', () => {
      const text = 'The final answer is {"c": {"nested": true}} as requested.';
      expect(finalizeInvokeAgentText(text, options)).toEqual({
        result: null,
        structuredOutput: { c: { nested: true } },
      });
    });

    it('[Given] output without any JSON [Then] throws the structured output error', () => {
      expect(() => finalizeInvokeAgentText('no structured payload here', options)).toThrow(
        'experimental_subAgent() expected valid JSON output for structured response.'
      );
    });

    it('[Given] no structured schema [Then] returns the trimmed text as the result', () => {
      expect(finalizeInvokeAgentText('  plain answer  ', {})).toEqual({ result: 'plain answer' });
    });
  });
});
