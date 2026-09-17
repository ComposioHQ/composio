import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { telemetry } from '@composio/core';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TypesafeAbortError,
  TypesafeApiError,
  TypesafeAuthenticationError,
  TypesafeConnectionError,
  TypesafeProvider,
  TypesafeRateLimitError,
  TypesafeRequestRejectedError,
  TypesafeServerError,
  TypesafeTimeoutError,
} from '../src';
import { corpusTool, failingClient, mockClient } from './helpers';

const tickets = corpusTool('string_enum_required');

const KEY_SENTINEL = 'sk-sentinel-api-key-0f3a';
const STATE_SENTINEL = 'STATE-SENTINEL-7c1d';
const BODY_SENTINEL = 'BODY-SENTINEL-99ab';
const ARGUMENT_SENTINEL = 'ARGUMENT-SENTINEL-42ee';
const SENTINELS = [KEY_SENTINEL, STATE_SENTINEL, BODY_SENTINEL, ARGUMENT_SENTINEL];

/** Every form an error takes on its way to a log, a serializer, or core telemetry. */
const renderings = (error: Error): string =>
  [
    inspect(error, { depth: 10, showHidden: true, getters: true }),
    JSON.stringify(error),
    JSON.stringify(error, Object.getOwnPropertyNames(error)),
    error.message,
    String(error.stack),
    inspect((error as { cause?: unknown }).cause, { depth: 10 }),
  ].join('\n');

const expectNoSentinels = (error: Error) => {
  const text = renderings(error);
  for (const sentinel of SENTINELS) expect(text).not.toContain(sentinel);
  expect((error as { cause?: unknown }).cause).toBeUndefined();
};

const sdkError = (name: string, fields: Record<string, unknown> = {}) =>
  Object.assign(new Error(`${name} ${BODY_SENTINEL}`), {
    name,
    body: { detail: BODY_SENTINEL },
    request: { state: STATE_SENTINEL },
    nested: { deep: { headers: { authorization: `Bearer ${KEY_SENTINEL}` } } },
    ...fields,
  });

const decideWith = (error: unknown) => {
  const { client } = failingClient(error);
  const provider = new TypesafeProvider({ client });
  return provider
    .decide(provider.wrapTools([tickets]), STATE_SENTINEL, {
      arguments: { title: ARGUMENT_SENTINEL },
    })
    .then(
      () => {
        throw new Error('decide resolved, so a failure was reported as a decision');
      },
      (caught: Error) => caught
    );
};

describe('SDK error mapping', () => {
  it('AE5: maps a RateLimitError to the rate-limit error with retryAfterMs', async () => {
    const error = await decideWith(
      sdkError('RateLimitError', { status: 429, requestId: 'req_429', retryAfterMs: 1500 })
    );
    expect(error).toBeInstanceOf(TypesafeRateLimitError);
    expect(error).toMatchObject({
      status: 429,
      requestId: 'req_429',
      retryAfterMs: 1500,
      sdkError: 'RateLimitError',
    });
    expect(error.message).toBe(
      'The TypeSafe API rate limit was exceeded. (status 429) [request req_429]'
    );
    expectNoSentinels(error);
  });

  it.each([
    ['APITimeoutError', {}, TypesafeTimeoutError],
    ['APIConnectionError', {}, TypesafeConnectionError],
    ['AuthenticationError', { status: 401 }, TypesafeAuthenticationError],
    ['PermissionDeniedError', { status: 403 }, TypesafeAuthenticationError],
    ['InternalServerError', { status: 503 }, TypesafeServerError],
    ['NotFoundError', { status: 404 }, TypesafeRequestRejectedError],
    ['APIUserAbortError', {}, TypesafeAbortError],
    ['SomethingNew', {}, TypesafeApiError],
  ] as const)(
    'maps %s to its own typed error and never to abstain',
    async (name, fields, expected) => {
      const error = await decideWith(sdkError(name, fields));
      expect(error.constructor).toBe(expected);
      expectNoSentinels(error);
    }
  );

  it('maps a thrown non-error value without retaining it', async () => {
    const error = await decideWith(`plain string ${STATE_SENTINEL}`);
    expect(error.constructor).toBe(TypesafeApiError);
    expectNoSentinels(error);
  });

  it('rejects with the abort error for an already-aborted signal, without a request', async () => {
    const { client, systemOne } = mockClient(() => undefined);
    const provider = new TypesafeProvider({ client });
    await expect(
      provider.decide(provider.wrapTools([tickets]), 'open a ticket', {
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeInstanceOf(TypesafeAbortError);
    expect(systemOne).not.toHaveBeenCalled();
  });

  it('passes signal and timeout through to the SDK request options', async () => {
    const { client, systemOne } = mockClient(() => undefined);
    const provider = new TypesafeProvider({ client, model: 'jev-1.13' });
    const { signal } = new AbortController();
    await provider.decide(provider.wrapTools([tickets]), 'open a ticket', {
      signal,
      timeout: 2500,
    });
    expect(systemOne).toHaveBeenCalledWith(expect.objectContaining({ model: 'jev-1.13' }), {
      signal,
      timeout: 2500,
    });
  });
});

describe('the actual SDK with a stubbed fetch', () => {
  const clientWith = (status: number, headers: Record<string, string> = {}) =>
    new TypeSafeClient({
      apiKey: KEY_SENTINEL,
      retry: { maxRetries: 0 },
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: BODY_SENTINEL }, echo: STATE_SENTINEL }), {
          status,
          headers: {
            'content-type': 'application/json',
            'x-typesafe-request-id': 'req_real',
            ...headers,
          },
        }),
    });

  it.each([
    [429, TypesafeRateLimitError],
    [401, TypesafeAuthenticationError],
    [500, TypesafeServerError],
    [404, TypesafeRequestRejectedError],
  ] as const)('maps HTTP %i and leaks no sentinel', async (status, expected) => {
    const provider = new TypesafeProvider({
      client: clientWith(status, { 'retry-after-ms': '250' }),
    });
    const error = await provider
      .decide(provider.wrapTools([tickets]), { request: STATE_SENTINEL, context: STATE_SENTINEL })
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(expected);
    expect(error).toMatchObject({ status, requestId: 'req_real' });
    if (status === 429) expect(error).toMatchObject({ retryAfterMs: 250 });
    expectNoSentinels(error as Error);
  });

  it('maps a transport failure and leaks no sentinel', async () => {
    const client = new TypeSafeClient({
      apiKey: KEY_SENTINEL,
      retry: { maxRetries: 0 },
      fetch: async () => {
        throw new TypeError(`fetch failed ${BODY_SENTINEL}`);
      },
    });
    const provider = new TypesafeProvider({ client });
    const error = await provider
      .decide(provider.wrapTools([tickets]), STATE_SENTINEL)
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(TypesafeConnectionError);
    expectNoSentinels(error as Error);
  });

  it('keeps sentinels out of the payload core telemetry sends', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TELEMETRY_DISABLED', 'false');
    const internals = telemetry as unknown as Record<
      'sendMetric' | 'sendErrorTelemetry',
      () => Promise<void>
    >;
    vi.spyOn(internals, 'sendMetric').mockResolvedValue();
    const sendError = vi.spyOn(internals, 'sendErrorTelemetry').mockResolvedValue();
    telemetry.setup({
      apiKey: 'composio-key',
      baseUrl: 'http://127.0.0.1',
      version: 'test',
      provider: 'typesafe',
    } as never);

    const provider = telemetry.instrument(new TypesafeProvider({ client: clientWith(500) }));
    await expect(
      provider.decide(provider.wrapTools([tickets]), STATE_SENTINEL)
    ).rejects.toBeInstanceOf(TypesafeServerError);
    await telemetry.flush();
    expect(sendError).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify(sendError.mock.calls[0]);
    expect(payload).toContain('TypesafeProvider.decide');
    expect(payload).toContain('TYPESAFE_SERVER_ERROR');
    for (const sentinel of SENTINELS) expect(payload).not.toContain(sentinel);
  });
});

describe('the client the provider builds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const healthy = () =>
    new Response(
      JSON.stringify({
        model: 'jev-1.13',
        answers: {
          route: {
            type: 'choice',
            choice: '__none__',
            confidence: 0.9,
            probabilities: { __none__: 0.9, SYMBOLS_LIST: 0.1 },
          },
          gate_0: { type: 'noul', noul: 0.9 },
          gate_1: { type: 'noul', noul: 0.9 },
          gate_2: { type: 'noul', noul: 0.9 },
        },
      }),
      { headers: { 'content-type': 'application/json' } }
    );

  const runWith = async (logLevel?: 'debug') => {
    vi.stubEnv('TYPESAFE_LOG_LEVEL', 'debug');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthy())
    );
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const provider = new TypesafeProvider({
      apiKey: KEY_SENTINEL,
      ...(logLevel ? { logLevel } : {}),
    });
    await provider.decide(provider.wrapTools([corpusTool('no_input_parameters')]), STATE_SENTINEL);
    return debug;
  };

  it('stays at warn when only TYPESAFE_LOG_LEVEL=debug is set', async () => {
    expect(await runWith()).not.toHaveBeenCalled();
  });

  it('logs at debug with the logLevel option', async () => {
    expect(await runWith('debug')).toHaveBeenCalled();
  });

  it('constructs and imports with no key and no side effects', () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new TypesafeProvider();
    expect(provider.name).toBe('typesafe');
    expect(provider._isAgentic).toBe(false);
    expect(provider.wrapTool(tickets).slug).toBe('TICKETS_CREATE');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// @typesafe-ai/sdk issue #2: v0.6.0 terminates Node after a caller catches its abort error.
// Reproduced on 20.20, 22.14, 22.22.3, and 24.13; 24.17 and later exit cleanly, which is why
// `engines.node` is `>=24.17.0`. A failure on an advertised runtime blocks publication; it is
// never worked around by swallowing unhandled rejections. `TYPESAFE_NODE_BINARIES` adds
// colon-separated Node binaries from other advertised release lines.
describe('cancellation in a child process with the actual SDK', () => {
  const child = fileURLToPath(new URL('./fixtures/cancellation-child.ts', import.meta.url));
  const runtimes = [
    process.execPath,
    ...(process.env.TYPESAFE_NODE_BINARIES?.split(':').filter(Boolean) ?? []),
  ];

  describe.each(runtimes)('on %s', node => {
    it.each([
      ['cancel', 'cancel: caught abort'],
      ['healthy', 'healthy: call'],
    ])('%s exits 0 with no unhandled rejection', (mode, line) => {
      const result = spawnSync(node, ['--import', 'tsx', child, mode], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, TYPESAFE_API_KEY: '', TYPESAFE_LOG_LEVEL: 'off', NODE_ENV: 'test' },
      });
      expect(result.stderr).not.toMatch(/unhandled|UnhandledPromiseRejection/i);
      expect(result.stdout).toContain(line);
      expect(result.status).toBe(0);
    });
  });
});
