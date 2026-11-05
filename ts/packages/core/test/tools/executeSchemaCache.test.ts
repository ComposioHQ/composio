import { describe, it, expect, vi, afterEach } from 'vitest';
import ComposioClient, { Auth, createFetchTransport } from '@composio/client';
import { Tools } from '../../src/models/Tools';
import { ComposioRequestCancelledError } from '../../src/errors/SDKErrors';
import { MockProvider } from '../utils/mocks/provider.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import {
  ComposioToolExecutionError,
  ComposioToolExecutionRateLimitError,
  ComposioToolFetchError,
  ComposioToolFetchRateLimitError,
  isComposioRateLimitError,
} from '../../src/errors/ToolErrors';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: { instrument: vi.fn() },
}));

const SLUG = 'GITHUB_GET_REPOS';
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const rateLimited = () =>
  json({ error: { message: 'slow down' } }, 429, { 'retry-after': '7', 'retry-after-ms': '1' });

/** A real client whose schema and execute responses come from the given handlers. */
const createTools = (
  options: {
    retrieve?: () => Response;
    execute?: () => Response;
    toolkitVersions?: Record<string, string>;
  } = {}
) => {
  const retrieve = vi.fn(options.retrieve ?? (() => json(toolMocks.rawTool)));
  const execute = vi.fn(options.execute ?? (() => json(toolMocks.rawToolExecuteResponse)));
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    return method === 'GET' ? retrieve() : execute();
  });
  const client = new ComposioClient({
    auth: Auth.project('test-api-key'),
    baseURL: 'https://backend.invalid',
    transport: createFetchTransport({ fetch }),
  });
  const tools = new Tools(client, {
    provider: new MockProvider(),
    toolkitVersions: options.toolkitVersions,
  });
  return { tools, retrieve, execute };
};

const run = (tools: ReturnType<typeof createTools>['tools'], version?: string) =>
  tools.execute(SLUG, {
    userId: 'user_1',
    arguments: {},
    version,
    dangerouslySkipVersionCheck: true,
  });

describe('tools.execute schema cache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the schema once across executions of one tool', async () => {
    const { tools, retrieve, execute } = createTools();

    await run(tools);
    await run(tools);
    await run(tools);

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('keeps a separate entry per version', async () => {
    const { tools, retrieve } = createTools();

    await run(tools, '20250909_00');
    await run(tools, '20250910_00');
    await run(tools, '20250909_00');

    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('refetches a latest schema after 5 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { tools, retrieve } = createTools();

    await run(tools);
    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    await run(tools);
    expect(retrieve).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await run(tools);
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('keeps a pinned schema for an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { tools, retrieve } = createTools();

    await run(tools, '20250909_00');
    vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    await run(tools, '20250909_00');
    expect(retrieve).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await run(tools, '20250909_00');
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('uses the pinned lifetime for a version set in toolkitVersions', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { tools, retrieve } = createTools({
      toolkitVersions: { [toolMocks.rawTool.toolkit.slug]: '20250909_00' },
    });

    await run(tools);
    vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    await run(tools);
    expect(retrieve).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await run(tools);
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('drops the oldest schema past 500 entries', async () => {
    const { tools, retrieve } = createTools();

    for (let i = 0; i <= 500; i++) {
      await run(tools, `v${i}`);
    }
    expect(retrieve).toHaveBeenCalledTimes(501);

    // The newest entry is still cached, and the oldest was dropped.
    await run(tools, 'v500');
    expect(retrieve).toHaveBeenCalledTimes(501);
    await run(tools, 'v0');
    expect(retrieve).toHaveBeenCalledTimes(502);
  });

  it('does not cache a failed fetch', async () => {
    const retrieve = vi
      .fn<() => Response>()
      .mockReturnValueOnce(json({ error: { message: 'bad' } }, 400))
      .mockReturnValue(json(toolMocks.rawTool));
    const { tools } = createTools({ retrieve });

    await expect(run(tools)).rejects.toThrow();
    await expect(run(tools)).resolves.toBeDefined();
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('still honors an aborted signal on a cache hit', async () => {
    const { tools, execute } = createTools();
    await run(tools);

    const error = await tools
      .execute(
        SLUG,
        { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
        { signal: AbortSignal.abort() }
      )
      .catch(e => e);

    expect(error).toBeInstanceOf(ComposioRequestCancelledError);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('leaves getRawComposioToolBySlug uncached', async () => {
    const { tools, retrieve } = createTools();

    await tools.getRawComposioToolBySlug(SLUG);
    await tools.getRawComposioToolBySlug(SLUG);

    expect(retrieve).toHaveBeenCalledTimes(2);
  });
});

describe('rate limit errors', () => {
  it('reports a rejected schema fetch as a rate limit, not a bad slug', async () => {
    const { tools, execute } = createTools({ retrieve: rateLimited });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolFetchRateLimitError);
    expect(error).toBeInstanceOf(ComposioToolFetchError);
    expect(isComposioRateLimitError(error)).toBe(true);
    expect(error.retryAfterSeconds).toBe(7);
    expect(error.statusCode).toBe(429);
    expect(error.possibleFixes).toEqual([
      'Wait 7 seconds, then retry',
      'Reduce how many requests your organization sends per minute',
    ]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports a rejected execution as a rate limit, once', async () => {
    const { tools, execute } = createTools({ execute: rateLimited });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolExecutionRateLimitError);
    expect(error).toBeInstanceOf(ComposioToolExecutionError);
    expect(isComposioRateLimitError(error)).toBe(true);
    expect(error.retryAfterSeconds).toBe(7);
    expect(error.statusCode).toBe(429);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('leaves out retryAfterSeconds when the response gives no wait', async () => {
    const { tools } = createTools({
      retrieve: () => json({ error: { message: 'slow down' } }, 429, { 'retry-after-ms': '1' }),
    });

    const error = await run(tools).catch(e => e);

    expect(isComposioRateLimitError(error)).toBe(true);
    expect(Object.keys(error)).not.toContain('retryAfterSeconds');
    expect(error.possibleFixes[0]).toBe('Wait before retrying');
  });

  it('does not report other failures as rate limits', async () => {
    const { tools } = createTools({
      retrieve: () => json({ error: { message: 'bad key' } }, 401),
    });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolFetchError);
    expect(isComposioRateLimitError(error)).toBe(false);
  });
});
