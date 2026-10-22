import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Composio } from '../../src/composio';
import logger from '../../src/utils/logger';
import { MockProvider } from '../utils/mocks/provider.mock';

const DEPRECATION_HEADER = '@1688169599';

const jsonResponse = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

const createSink = () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
});

const createComposio = (config: Partial<ConstructorParameters<typeof Composio>[0]> = {}) =>
  new Composio({
    apiKey: 'uak_test_secret',
    baseURL: 'https://backend.composio.test',
    provider: new MockProvider(),
    allowTracking: false,
    disableVersionCheck: true,
    ...config,
  });

describe('Composio logger and logLevel configuration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // The SDK logger is a process-wide singleton; restore the defaults so
    // later tests in this file start from a known state.
    logger.configure({ level: 'info', sink: console });
  });

  it('routes response Deprecation header warnings through the configured logger', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }, { Deprecation: DEPRECATION_HEADER }));
    const composio = createComposio({ logger: sink });

    await composio.getClient().toolkits.list();

    expect(sink.warn).toHaveBeenCalledTimes(1);
    const message = String(sink.warn.mock.calls[0]?.[0]);
    expect(message).toContain('deprecated');
    expect(message).toContain('toolkits.list');
  });

  it('formats and redacts client warnings with the SDK logger before they reach the sink', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { items: [] },
        {
          Deprecation: DEPRECATION_HEADER,
          Link: '<https://backend.composio.test/docs?api_key=uak_leaked_secret>; rel="deprecation"',
        }
      )
    );
    const composio = createComposio({ logger: sink });

    await composio.getClient().toolkits.list();

    expect(sink.warn).toHaveBeenCalledTimes(1);
    const message = String(sink.warn.mock.calls[0]?.[0]);
    // SDK formatting prepends an ISO timestamp.
    expect(message).toMatch(/^\S*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\S* - /);
    expect(message).not.toContain('uak_leaked_secret');
    expect(message).toContain('[REDACTED]');
  });

  it('warns about deprecated request inputs before the request is dispatched', async () => {
    const sink = createSink();
    const order: string[] = [];
    sink.warn.mockImplementation(() => order.push('warn'));
    fetchMock.mockImplementation(async () => {
      order.push('fetch');
      return jsonResponse({ items: [], total_pages: 1, current_page: 1, total_items: 0 });
    });
    const composio = createComposio({ logger: sink });

    await composio.getClient().tools.list({ search: 'x' });

    expect(sink.warn).toHaveBeenCalledTimes(1);
    const message = String(sink.warn.mock.calls[0]?.[0]);
    expect(message).toContain('`search`');
    expect(message).toContain('deprecated');
    expect(order).toEqual(['warn', 'fetch']);
  });

  it("suppresses both deprecation warnings when logLevel is 'silent'", async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }, { Deprecation: DEPRECATION_HEADER }));
    const composio = createComposio({ logger: sink, logLevel: 'silent' });

    await composio.getClient().toolkits.list();
    await composio.getClient().tools.list({ search: 'x' });

    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.error).not.toHaveBeenCalled();
  });

  it("suppresses warnings when logLevel is 'error'", async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }, { Deprecation: DEPRECATION_HEADER }));
    const composio = createComposio({ logger: sink, logLevel: 'error' });

    await composio.getClient().toolkits.list();
    await composio.getClient().tools.list({ search: 'x' });

    expect(sink.warn).not.toHaveBeenCalled();
    expect(logger.getLevel()).toBe('error');
  });

  it('keeps per-request client logs out of the default info level', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    const composio = createComposio({ logger: sink });

    await composio.getClient().toolkits.list();

    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();
  });

  it("routes per-request client logs to debug when logLevel is 'debug'", async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    const composio = createComposio({ logger: sink, logLevel: 'debug' });

    await composio.getClient().toolkits.list();

    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.debug.mock.calls.map(call => String(call[0])).join('\n')).toContain('/toolkits');
  });

  it('leaves the singleton untouched when neither option is provided', () => {
    const sink = createSink();
    logger.configure({ level: 'debug', sink });

    createComposio();

    expect(logger.getLevel()).toBe('debug');
    logger.debug('still routed');
    expect(String(sink.debug.mock.lastCall?.[0])).toContain('still routed');
  });

  it('applies logLevel without replacing the sink, and the last instance wins', () => {
    const first = createSink();
    const second = createSink();

    createComposio({ logger: first, logLevel: 'warn' });
    expect(logger.getLevel()).toBe('warn');

    createComposio({ logLevel: 'debug' });
    expect(logger.getLevel()).toBe('debug');
    logger.debug('to first');
    expect(String(first.debug.mock.lastCall?.[0])).toContain('to first');
    expect(second.debug).not.toHaveBeenCalled();

    createComposio({ logger: second });
    const firstCallsBefore = first.debug.mock.calls.length;
    logger.debug('to second');
    expect(first.debug.mock.calls.length).toBe(firstCallsBefore);
    expect(String(second.debug.mock.lastCall?.[0])).toContain('to second');
  });
});
