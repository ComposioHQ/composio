import { afterEach, describe, expect, test } from 'bun:test';
import { generateText, streamText } from 'ai';
import { createInceptionChatModel } from '../../agent/agent';

/**
 * Provider-level regression tests for the system prompt disclosure finding.
 *
 * These drive a real model call through the configured `inception` provider
 * with a stubbed `fetch`, because the AI SDK builds its own `APICallError`
 * objects that carry `requestBodyValues` (the chat payload, system prompt
 * included). Calling `safeInceptionFetch` directly does not exercise that.
 */

const SYSTEM_PROMPT = 'CONFIDENTIAL-EVE-SYSTEM-PROMPT-CANARY';
const SAFE_MESSAGE = 'Docs agent model request failed.';

const originalFetch = globalThis.fetch;
const originalInceptionApiKey = process.env.INCEPTION_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.INCEPTION_API_KEY = originalInceptionApiKey;
});

/**
 * Walks own properties (including non-enumerable ones such as `message`) and
 * the `cause` chain. `JSON.stringify(error, propertyNames)` filters keys at
 * every depth and silently misses nested payloads like `requestBodyValues`.
 */
function serializeDeep(value: unknown, seen = new Set<unknown>()): string {
  if (value === null || typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(entry => serializeDeep(entry, seen)).join('|');
  }

  return Object.getOwnPropertyNames(value)
    .map(key => {
      let nested: unknown;
      try {
        nested = (value as Record<string, unknown>)[key];
      } catch {
        return `${key}=[unreadable]`;
      }
      return `${key}=${serializeDeep(nested, seen)}`;
    })
    .join('|');
}

function expectNoPromptLeak(error: unknown) {
  const serialized = serializeDeep(error);
  expect(serialized).not.toContain(SYSTEM_PROMPT);
  expect(JSON.stringify(error ?? null)).not.toContain(SYSTEM_PROMPT);
  expect(JSON.stringify((error as { requestBodyValues?: unknown })?.requestBodyValues ?? null)).not.toContain(
    SYSTEM_PROMPT
  );
  expect(serializeDeep((error as { cause?: unknown })?.cause)).not.toContain(SYSTEM_PROMPT);
}

function stubFetch(handler: () => Promise<Response>) {
  process.env.INCEPTION_API_KEY = 'test-key';
  globalThis.fetch = handler as typeof fetch;
}

function sseResponse(...frames: string[]) {
  return new Response(`${frames.map(frame => `data: ${frame}`).join('\n\n')}\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const ERROR_FRAME =
  '{"error":{"message":"quota exceeded","type":"insufficient_quota","code":"insufficient_quota"}}';
const TEXT_FRAME =
  '{"id":"1","object":"chat.completion.chunk","created":1,"model":"mercury-2","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"},"finish_reason":null}]}';

async function captureGenerateError() {
  try {
    await generateText({
      model: createInceptionChatModel(),
      system: SYSTEM_PROMPT,
      prompt: 'How do Composio sessions work?',
      maxRetries: 0,
    });
    return undefined;
  } catch (error) {
    return error;
  }
}

async function captureStreamError() {
  let captured: unknown;
  const result = streamText({
    model: createInceptionChatModel(),
    system: SYSTEM_PROMPT,
    prompt: 'How do Composio sessions work?',
    maxRetries: 0,
    onError: ({ error }) => {
      captured ??= error;
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') captured ??= part.error;
  }

  return captured;
}

describe('Inception model error sanitization', () => {
  test('non-2xx upstream responses do not leak the system prompt', async () => {
    stubFetch(async () => new Response('upstream exploded', { status: 500 }));

    const error = await captureGenerateError();

    expectNoPromptLeak(error);
    expect((error as Error)?.message).toContain(SAFE_MESSAGE);
  });

  test('200 responses with a JSON error payload do not leak the system prompt', async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    const error = await captureGenerateError();

    expectNoPromptLeak(error);
    expect((error as Error)?.message).toContain(SAFE_MESSAGE);
  });

  test('transport failures do not leak the system prompt', async () => {
    stubFetch(async () => {
      const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
        code: 'ECONNREFUSED',
      });
      throw Object.assign(new TypeError('fetch failed'), { cause });
    });

    const error = await captureGenerateError();

    expectNoPromptLeak(error);
    expect((error as Error)?.message).toContain(SAFE_MESSAGE);
  });

  test('streamed error frames before any output do not leak the system prompt', async () => {
    stubFetch(async () => sseResponse(ERROR_FRAME, '[DONE]'));

    const error = await captureStreamError();

    expect(error).toBeDefined();
    expectNoPromptLeak(error);
    expect((error as Error)?.message).toContain(SAFE_MESSAGE);
  });

  test('streamed error frames after output has started do not leak the system prompt', async () => {
    stubFetch(async () => sseResponse(TEXT_FRAME, ERROR_FRAME, '[DONE]'));

    const error = await captureStreamError();

    expect(error).toBeDefined();
    expectNoPromptLeak(error);
    expect((error as Error)?.message).toContain(SAFE_MESSAGE);
  });

  test('abort errors still reach the AI SDK unchanged', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    stubFetch(async () => {
      throw abortError;
    });

    const error = await captureGenerateError();

    expect(error).toBe(abortError);
  });
});
