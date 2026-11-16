import { describe, it, expect, vi, afterEach } from 'vitest';
import ComposioClient, { APIError, Auth, createFetchTransport } from '@composio/client';
import { Tools } from '../../src/models/Tools';
import { ComposioRequestCancelledError } from '../../src/errors/SDKErrors';
import { MockProvider } from '../utils/mocks/provider.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import { ComposioConnectedAccountNotFoundError } from '../../src/errors/ConnectedAccountsErrors';
import {
  ComposioToolExecutionError,
  ComposioToolExecutionRateLimitError,
  ComposioToolFetchError,
  ComposioToolFetchRateLimitError,
  ComposioToolNotFoundError,
  handleToolExecutionError,
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

describe('transport metadata on errors', () => {
  it('reads the status and request id of a rejected schema fetch from its cause', async () => {
    const { tools } = createTools({
      retrieve: () =>
        json(
          { error: { message: 'bad key', code: 1001, slug: 'UNAUTHORIZED', status: 401 } },
          401,
          { 'x-request-id': 'req_fetch_401' }
        ),
    });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolFetchError);
    expect(error.statusCode).toBe(401);
    expect(error.requestId).toBe('req_fetch_401');
    expect(error.cause).toBeInstanceOf(APIError);
  });
});

describe('tool execution errors', () => {
  const rejected = (
    status: number,
    error: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) => json({ error: { slug: 'ERROR', status, ...error } }, status, headers);
  const SLUG_FIX = 'Ensure the tool slug is correct and the input arguments for the tool is valid';

  it('surfaces the server message, suggested fix and codes of a 410', async () => {
    const { tools } = createTools({
      execute: () =>
        rejected(
          410,
          {
            message: 'Toolkit version 20250101_00 is retired',
            code: 1410,
            suggested_fix: 'Pin 20250909_00',
          },
          { 'x-request-id': 'req_410' }
        ),
    });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolExecutionError);
    expect(error.message).toBe(
      `Error executing the tool ${toolMocks.rawTool.slug}: Toolkit version 20250101_00 is retired`
    );
    expect(error.code).toBe('TS-SDK::TOOL_EXECUTION_ERROR');
    expect(error.statusCode).toBe(410);
    expect(error.apiErrorCode).toBe(1410);
    expect(error.requestId).toBe('req_410');
    expect(error.possibleFixes).toEqual(['Pin 20250909_00']);
    expect(error.cause).toBeInstanceOf(APIError);
    expect(error.cause.status).toBe(410);
  });

  it('falls back to a status-specific fix for a 403 without a suggested fix', async () => {
    const { tools } = createTools({
      execute: () =>
        rejected(403, { message: 'Connected account belongs to another project', code: 1403 }),
    });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolExecutionError);
    expect(error.message).toBe(
      `Error executing the tool ${toolMocks.rawTool.slug}: Connected account belongs to another project`
    );
    expect(error.statusCode).toBe(403);
    expect(error.apiErrorCode).toBe(1403);
    expect(error.possibleFixes).toEqual([
      'Ensure your API key and the connected account are allowed to run this tool',
    ]);
    expect(error.cause).toBeInstanceOf(APIError);
  });

  it.each([402, 410, 500, 503])('never blames the slug or arguments for a %i', async status => {
    const { tools } = createTools({ execute: () => rejected(status, { message: 'no', code: 1 }) });

    const error = await run(tools).catch(e => e);

    expect(error.statusCode).toBe(status);
    expect(error.possibleFixes).not.toContain(SLUG_FIX);
  });

  it('keeps the tool context alone when the body is not the error envelope', async () => {
    const { tools } = createTools({ execute: () => json({ unexpected: true }, 400) });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolExecutionError);
    expect(error.message).toBe(`Error executing the tool ${toolMocks.rawTool.slug}`);
    expect(error.statusCode).toBe(400);
    expect(Object.keys(error)).not.toContain('apiErrorCode');
    expect(error.possibleFixes).toEqual([SLUG_FIX]);
  });

  it('strips terminal escapes and line breaks from server text', async () => {
    const { tools } = createTools({
      execute: () =>
        rejected(403, {
          message: 'denied\u001b[31m\n[!] run: evil',
          code: 1403,
          suggested_fix: 'retry\u001b]0;owned\u0007 now',
        }),
    });

    const error = await run(tools).catch(e => e);

    expect(error.message).toBe(
      `Error executing the tool ${toolMocks.rawTool.slug}: denied [!] run: evil`
    );
    expect(error.possibleFixes).toEqual(['retry now']);
    expect(error.message).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
  });

  it('keeps the original reason when the failure never reached the API', () => {
    const error = handleToolExecutionError(SLUG, new Error('socket hang up\n\u001b[31m'));

    expect(error.message).toBe(`Error executing the tool ${SLUG}: socket hang up`);
  });

  it('surfaces the server details of a rate limit', async () => {
    const { tools } = createTools({
      execute: () =>
        rejected(
          429,
          { message: 'slow down', code: 1429, suggested_fix: 'Wait an hour' },
          { 'retry-after': '7' }
        ),
    });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolExecutionRateLimitError);
    expect(error.message).toBe(
      `Rate limited while executing the tool ${toolMocks.rawTool.slug}: slow down`
    );
    expect(error.statusCode).toBe(429);
    expect(error.apiErrorCode).toBe(1429);
    expect(error.possibleFixes).toEqual(['Wait an hour']);
    expect(error.retryAfterSeconds).toBe(7);
  });

  it('keeps the server status, fix and code of a missing connected account', async () => {
    const { tools } = createTools({
      execute: () =>
        rejected(400, {
          message: 'No connected account found',
          code: 1803,
          suggested_fix: 'Connect Gmail first',
        }),
    });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioConnectedAccountNotFoundError);
    expect(error.message).toBe('No connected account found');
    expect(error.statusCode).toBe(400);
    expect(error.apiErrorCode).toBe(1803);
    expect(error.possibleFixes).toEqual(['Connect Gmail first']);
    expect(error.cause).toBeInstanceOf(APIError);
    expect(error.cause.status).toBe(400);
  });
});

describe('tool fetch errors', () => {
  it('surfaces the server details of a 429', async () => {
    const { tools } = createTools({
      retrieve: () =>
        json(
          {
            error: {
              message: 'slow down',
              code: 1429,
              slug: 'RATE_LIMITED',
              status: 429,
              suggested_fix: 'Wait an hour',
            },
          },
          429,
          { 'retry-after': '7', 'retry-after-ms': '1' }
        ),
    });

    const error = await run(tools).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolFetchRateLimitError);
    expect(error.message).toBe(`Rate limited while retrieving tool with slug ${SLUG}: slow down`);
    expect(error.statusCode).toBe(429);
    expect(error.apiErrorCode).toBe(1429);
    expect(error.possibleFixes).toEqual(['Wait an hour']);
    expect(error.retryAfterSeconds).toBe(7);
  });

  it('surfaces the server details of a 410', async () => {
    const { tools, execute } = createTools({
      retrieve: () =>
        json(
          {
            error: {
              message: 'Toolkit version 20250101_00 is retired',
              code: 1410,
              slug: 'TOOLKIT_VERSION_RETIRED',
              status: 410,
              suggested_fix: 'Pin 20250909_00',
            },
          },
          410,
          { 'x-request-id': 'req_fetch_410' }
        ),
    });

    const error = await tools.getRawComposioToolBySlug(SLUG).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolFetchError);
    expect(error.message).toBe(
      `Unable to retrieve tool with slug ${SLUG}: Toolkit version 20250101_00 is retired`
    );
    expect(error.statusCode).toBe(410);
    expect(error.apiErrorCode).toBe(1410);
    expect(error.requestId).toBe('req_fetch_410');
    expect(error.possibleFixes).toEqual(['Pin 20250909_00']);
    expect(execute).not.toHaveBeenCalled();
  });

  it('surfaces the server details of a 404', async () => {
    const { tools } = createTools({
      retrieve: () =>
        json(
          {
            error: {
              message: 'No tool with that slug in the pinned version',
              code: 1404,
              slug: 'TOOL_NOT_FOUND',
              status: 404,
              suggested_fix: 'Use the latest version',
            },
          },
          404
        ),
    });

    const error = await tools.getRawComposioToolBySlug(SLUG).catch(e => e);

    expect(error).toBeInstanceOf(ComposioToolNotFoundError);
    expect(error.message).toBe(
      `Tool with slug ${SLUG} not found: No tool with that slug in the pinned version`
    );
    expect(error.statusCode).toBe(404);
    expect(error.apiErrorCode).toBe(1404);
    expect(error.possibleFixes).toEqual(['Use the latest version']);
  });
});
