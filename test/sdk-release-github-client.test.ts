import { describe, expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import { GitHub, request } from '../scripts/sdk-release/github';
import { json, runRelease, type Fetch } from './sdk-release-harness';

const Ref = Schema.Struct({ ref: Schema.String });

/** Answers each request with the next response and counts the requests. */
const scripted = (...responses: Array<() => Response | Promise<Response>>) => {
  const seen: string[] = [];
  const fetcher: Fetch = async (input, init) => {
    seen.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`);
    const next = responses[Math.min(seen.length, responses.length) - 1];
    return next();
  };
  return { fetcher, seen };
};

const githubError = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ message, documentation_url: 'https://docs.github.com' }), {
    status,
    headers: { 'x-github-request-id': 'C766:174D:1', ...headers },
  });

const call = (
  fetcher: Fetch,
  method: 'GET' | 'POST' = 'GET',
  policy: Parameters<typeof GitHub.layer>[1] = { baseDelayMs: 1 }
) =>
  runRelease(
    request(
      method,
      '/repos/ComposioHQ/composio/git/refs',
      Ref,
      method === 'GET' ? undefined : {}
    ).pipe(Effect.provide(GitHub.layer('token', policy))),
    fetcher
  );

describe('GitHub client', () => {
  test("a 422 reports GitHub's message and request ID and is not retried", async () => {
    const github = scripted(() => githubError(422, 'Reference already exists'));
    const failure = call(github.fetcher, 'POST');
    await expect(failure).rejects.toThrow('Reference already exists');
    await expect(failure).rejects.toThrow('C766:174D:1');
    expect(github.seen).toHaveLength(1);
  });

  test('a GET that returns 502 succeeds on the retry', async () => {
    const github = scripted(
      () => githubError(502, 'Server Error'),
      () => json({ ref: 'refs/heads/next' })
    );
    expect(await call(github.fetcher)).toEqual({ ref: 'refs/heads/next' });
    expect(github.seen).toHaveLength(2);
  });

  test('a POST that returns 502 is not retried, since GitHub may have applied it', async () => {
    const github = scripted(() => githubError(502, 'Server Error'));
    const failure = call(github.fetcher, 'POST');
    await expect(failure).rejects.toThrow('(502): Server Error');
    await expect(failure).rejects.toThrow('C766:174D:1');
    expect(github.seen).toHaveLength(1);
  });

  test('a rate-limited write waits for Retry-After and retries', async () => {
    const github = scripted(
      () =>
        githubError(403, 'You have exceeded a secondary rate limit.', {
          'x-ratelimit-remaining': '0',
          'retry-after': '1',
        }),
      () => json({ ref: 'refs/tags/sdk-release/8' })
    );
    const started = performance.now();
    expect(await call(github.fetcher, 'POST')).toEqual({ ref: 'refs/tags/sdk-release/8' });
    expect(performance.now() - started).toBeGreaterThanOrEqual(950);
    expect(github.seen).toHaveLength(2);
  });

  test("a 403 that is not a rate limit fails at once with GitHub's message", async () => {
    const github = scripted(() => githubError(403, 'Resource not accessible by integration'));
    await expect(call(github.fetcher)).rejects.toThrow(
      '(403): Resource not accessible by integration'
    );
    expect(github.seen).toHaveLength(1);
  });

  test('a rate limit asking for a longer wait than the policy allows gives up at once', async () => {
    const github = scripted(() => githubError(429, 'Too Many Requests', { 'retry-after': '3600' }));
    await expect(call(github.fetcher)).rejects.toThrow('gave up after 1 attempt');
    expect(github.seen).toHaveLength(1);
  });

  test('repeated 503s stop after the attempt budget', async () => {
    const github = scripted(() => githubError(503, 'Service Unavailable'));
    await expect(call(github.fetcher)).rejects.toThrow('after 5 attempts');
    expect(github.seen).toHaveLength(5);
  });

  test('a request that times out is retried', async () => {
    const github = scripted(
      () => new Promise<Response>(() => {}),
      () => json({ ref: 'refs/heads/next' })
    );
    expect(await call(github.fetcher, 'GET', { baseDelayMs: 1, timeout: '50 millis' })).toEqual({
      ref: 'refs/heads/next',
    });
    expect(github.seen).toHaveLength(2);
  });

  test('a response the schema cannot read is not retried', async () => {
    const github = scripted(() => json({ object: {} }));
    await expect(call(github.fetcher)).rejects.toThrow('cannot read');
    expect(github.seen).toHaveLength(1);
  });
});
