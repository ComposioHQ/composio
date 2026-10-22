import { afterEach, describe, expect, test } from 'bun:test';
import { safeInceptionFetch } from '../../agent/agent';

const originalFetch = globalThis.fetch;
const originalInceptionApiKey = process.env.INCEPTION_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.INCEPTION_API_KEY = originalInceptionApiKey;
});

describe('Inception fetch wrapper', () => {
  test('preserves abort-like fetch errors for the AI SDK', async () => {
    process.env.INCEPTION_API_KEY = 'test-key';
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    globalThis.fetch = async () => {
      throw abortError;
    };

    await expect(safeInceptionFetch('https://example.com')).rejects.toBe(abortError);
  });

  test('treats 200 JSON error payloads as upstream model failures', async () => {
    process.env.INCEPTION_API_KEY = 'test-key';
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    await expect(safeInceptionFetch('https://example.com')).rejects.toThrow(
      'Docs agent model request failed. Upstream returned an error payload.'
    );
  });
});
