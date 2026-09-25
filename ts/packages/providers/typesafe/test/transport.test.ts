import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypesafeApiError, TypesafeProvider } from '../src';
import { corpusTool, failingClient, mockClient } from './helpers';

const tickets = corpusTool('string_enum_required');

const KEY_SENTINEL = 'sk-sentinel-api-key-0f3a';
const STATE_SENTINEL = 'STATE-SENTINEL-7c1d';
const BODY_SENTINEL = 'BODY-SENTINEL-99ab';

const sdkError = (name: string, fields: Record<string, unknown> = {}) =>
  Object.assign(new Error(`${name} ${BODY_SENTINEL}`), {
    name,
    body: { detail: BODY_SENTINEL },
    request: { state: STATE_SENTINEL },
    headers: { authorization: `Bearer ${KEY_SENTINEL}` },
    ...fields,
  });

const decideWith = (error: unknown): Promise<TypesafeApiError> => {
  const provider = new TypesafeProvider({ client: failingClient(error).client });
  return provider.decide(provider.wrapTools([tickets]), STATE_SENTINEL).then(
    () => {
      throw new Error('decide resolved, so a failure was reported as a decision');
    },
    (caught: TypesafeApiError) => caught
  );
};

describe('SDK error mapping', () => {
  it('maps a rate limit with its diagnostics, and keeps nothing else of the SDK error', async () => {
    const error = await decideWith(
      sdkError('RateLimitError', { status: 429, requestId: 'req_429', retryAfterMs: 1500 })
    );
    expect(error).toBeInstanceOf(TypesafeApiError);
    expect(error).toMatchObject({
      reason: 'rate_limit',
      status: 429,
      requestId: 'req_429',
      retryAfterMs: 1500,
    });
    expect(error.message).toBe(
      'The TypeSafe API rate limit was exceeded. (status 429) [request req_429]'
    );
    const rendered = [
      inspect(error, { depth: 10, showHidden: true, getters: true }),
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    ].join('\n');
    for (const sentinel of [KEY_SENTINEL, STATE_SENTINEL, BODY_SENTINEL])
      expect(rendered).not.toContain(sentinel);
    expect(error.cause).toBeUndefined();
  });

  it.each([
    ['APITimeoutError', {}, 'timeout'],
    ['APIConnectionError', {}, 'connection'],
    ['AuthenticationError', { status: 401 }, 'authentication'],
    ['PermissionDeniedError', { status: 403 }, 'authentication'],
    ['InternalServerError', { status: 503 }, 'server_error'],
    ['NotFoundError', { status: 404 }, 'request_rejected'],
    ['APIUserAbortError', {}, 'aborted'],
    ['SomethingNew', {}, 'unknown'],
  ] as const)('maps %s to an API error and never to abstain', async (name, fields, reason) => {
    expect(await decideWith(sdkError(name, fields))).toMatchObject({ reason });
  });

  it('maps a thrown non-error value', async () => {
    expect(await decideWith('plain string')).toMatchObject({ reason: 'unknown' });
  });

  it('rejects for an already-aborted signal without a request', async () => {
    const { client, systemOne } = mockClient(() => undefined);
    const provider = new TypesafeProvider({ client });
    await expect(
      provider.decide(provider.wrapTools([tickets]), 'open a ticket', {
        signal: AbortSignal.abort(),
      })
    ).rejects.toMatchObject({ reason: 'aborted' });
    expect(systemOne).not.toHaveBeenCalled();
  });

  it('passes the model, signal, and timeout through to the SDK', async () => {
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

  it('retries on retryable status code (429) and succeeds on second attempt', async () => {
    let callCount = 0;
    const { client } = mockClient(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw sdkError('RateLimitError', { status: 429 });
      }
      return {
        model: 'jev-1.13',
        answers: {
          route: {
            type: 'choice',
            choice: '__none__',
            confidence: 0.9,
            probabilities: { __none__: 0.9 },
          },
          gate_0: { type: 'noul', noul: 0.9 },
          gate_1: { type: 'noul', noul: 0.9 },
          gate_2: { type: 'noul', noul: 0.9 },
        },
      };
    });

    const provider = new TypesafeProvider({ client });
    const decision = await provider.decide(
      provider.wrapTools([corpusTool('no_input_parameters')]),
      'some state',
      { maxRetries: 2, backoffMs: 1 }
    );

    expect(callCount).toBe(2);
    expect(decision.kind).toBe('abstain');
  });

  it('exhausts retries and throws the provider error when failures persist', async () => {
    let callCount = 0;
    const { client } = mockClient(async () => {
      callCount += 1;
      throw sdkError('InternalServerError', { status: 503 });
    });

    const provider = new TypesafeProvider({ client });
    await expect(
      provider.decide(provider.wrapTools([tickets]), 'open a ticket', {
        maxRetries: 2,
        backoffMs: 1,
      })
    ).rejects.toMatchObject({ reason: 'server_error', status: 503 });

    expect(callCount).toBe(3); // Initial attempt + 2 retries
  });
});

describe('the client the provider builds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('constructs and wraps with no key and no request', () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new TypesafeProvider();
    expect(provider.name).toBe('typesafe');
    expect(provider.wrapTool(tickets).slug).toBe('TICKETS_CREATE');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never logs request bodies, even with TYPESAFE_LOG_LEVEL=debug', async () => {
    vi.stubEnv('TYPESAFE_LOG_LEVEL', 'debug');
    const answers = {
      route: {
        type: 'choice',
        choice: '__none__',
        confidence: 0.9,
        probabilities: { __none__: 0.9, SYMBOLS_LIST: 0.1 },
      },
      gate_0: { type: 'noul', noul: 0.9 },
      gate_1: { type: 'noul', noul: 0.9 },
      gate_2: { type: 'noul', noul: 0.9 },
    };
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ model: 'jev-1.13', answers }), {
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const provider = new TypesafeProvider({ apiKey: KEY_SENTINEL });
    await provider.decide(provider.wrapTools([corpusTool('no_input_parameters')]), STATE_SENTINEL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
  });
});
