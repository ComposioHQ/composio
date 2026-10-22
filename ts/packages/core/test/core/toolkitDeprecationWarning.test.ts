import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Composio } from '../../src/composio';
import logger from '../../src/utils/logger';
import { _resetToolkitDeprecationWarningsForTests } from '../../src/utils/toolkitDeprecation';
import { toolMocks } from '../utils/mocks/data.mock';
import { MockProvider } from '../utils/mocks/provider.mock';

const HEADER = 'Composio-Deprecated-Toolkits';
const GMAIL_ITEM =
  '"GMAIL";version="20250114_00";deprecated=@1779840000;sunset=@1787788800;reason="lifecycle"';
const CLIENT_DEPRECATION = '@1688169599';

const jsonResponse = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

const rawTool = { ...toolMocks.rawTool, toolkit: { ...toolMocks.rawTool.toolkit, slug: 'gmail' } };
const executeBody = { data: { ok: true }, successful: true, error: null };

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

/** Serves the tool schema on GET and the execute body on POST, both with `headers`. */
const routeByMethod =
  (headers: { retrieve?: Record<string, string>; execute?: Record<string, string> }) =>
  async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    init?.method === 'POST'
      ? jsonResponse(executeBody, headers.execute)
      : jsonResponse(rawTool, headers.retrieve);

const warnMessages = (sink: ReturnType<typeof createSink>): string[] =>
  sink.warn.mock.calls.map(call => String(call[0]));

describe('Composio toolkit deprecation warning', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetToolkitDeprecationWarningsForTests();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    _resetToolkitDeprecationWarningsForTests();
    logger.configure({ level: 'info', sink: console });
  });

  it('warns once when a tool retrieve response carries the header', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse(rawTool, { [HEADER]: GMAIL_ITEM }));
    const composio = createComposio({ logger: sink });

    const tool = await composio.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');

    expect(tool.slug).toBe('COMPOSIO_TOOL');
    expect(sink.warn).toHaveBeenCalledTimes(1);
    const [message] = warnMessages(sink);
    expect(message).toContain('[Deprecation] Toolkit GMAIL version 20250114_00');
    expect(message).toContain('deprecated on 2026-05-27 (lifecycle)');
    expect(message).toContain('stop working on 2026-08-27');
    expect(message).toContain("toolkitVersions: { gmail: '<version>' }");
    expect(message).toContain('COMPOSIO_TOOLKIT_VERSION_GMAIL');
    expect(message).toContain(
      'https://docs.composio.dev/docs/tools-direct/toolkit-versioning#deprecation-and-sunset'
    );
  });

  it('warns once on the execute path even though both responses carry the item', async () => {
    const sink = createSink();
    fetchMock.mockImplementation(
      routeByMethod({ retrieve: { [HEADER]: GMAIL_ITEM }, execute: { [HEADER]: GMAIL_ITEM } })
    );
    const composio = createComposio({ logger: sink });

    const result = await composio.tools.execute('COMPOSIO_TOOL', {
      userId: 'user-1',
      arguments: { query: 'x' },
      version: '20250114_00',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.successful).toBe(true);
    expect(sink.warn).toHaveBeenCalledTimes(1);
  });

  it('warns when only the no-retry execute response carries the header', async () => {
    const sink = createSink();
    fetchMock.mockImplementation(routeByMethod({ execute: { [HEADER]: GMAIL_ITEM } }));
    const composio = createComposio({ logger: sink });

    await composio.tools.execute('COMPOSIO_TOOL', {
      userId: 'user-1',
      arguments: { query: 'x' },
      version: '20250114_00',
    });

    expect(sink.warn).toHaveBeenCalledTimes(1);
    expect(warnMessages(sink)[0]).toContain('GMAIL version 20250114_00');
  });

  it('stays silent without the header', async () => {
    const sink = createSink();
    fetchMock.mockImplementation(routeByMethod({}));
    const composio = createComposio({ logger: sink });

    await composio.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');
    await composio.tools.execute('COMPOSIO_TOOL', {
      userId: 'user-1',
      arguments: { query: 'x' },
      version: '20250114_00',
    });

    expect(sink.warn).not.toHaveBeenCalled();
  });

  it.each(['error', 'silent'] as const)("is suppressed when logLevel is '%s'", async level => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse(rawTool, { [HEADER]: GMAIL_ITEM }));
    const composio = createComposio({ logger: sink, logLevel: level });

    await composio.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');

    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
  });

  it('emits the client Deprecation warning and ours as two distinct messages', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(
      jsonResponse(rawTool, { Deprecation: CLIENT_DEPRECATION, [HEADER]: GMAIL_ITEM })
    );
    const composio = createComposio({ logger: sink });

    await composio.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');

    expect(sink.warn).toHaveBeenCalledTimes(2);
    const messages = warnMessages(sink);
    const ours = messages.filter(message => message.includes('[Deprecation] Toolkit GMAIL'));
    const theirs = messages.filter(message => message.includes('tools.retrieve'));
    expect(ours).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toContain('deprecated');
  });

  it('never throws on a malformed header and still returns the body', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse(rawTool, { [HEADER]: '"GMAIL;version=;;@@' }));
    const composio = createComposio({ logger: sink });

    const tool = await composio.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');

    expect(tool.slug).toBe('COMPOSIO_TOOL');
    expect(tool.toolkit?.slug).toBe('gmail');
    expect(sink.warn).not.toHaveBeenCalled();
    expect(sink.error).not.toHaveBeenCalled();
  });

  it('does not re-warn from a second instance or a session clone, but does after reset', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse(rawTool, { [HEADER]: GMAIL_ITEM }));
    const first = createComposio({ logger: sink });
    await first.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');
    expect(sink.warn).toHaveBeenCalledTimes(1);

    const second = createComposio({ logger: sink });
    await second.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');
    const clone = first.createSession({ headers: { 'x-request-id': 'r1' } });
    await clone.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');
    expect(sink.warn).toHaveBeenCalledTimes(1);

    _resetToolkitDeprecationWarningsForTests();
    await clone.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');
    expect(sink.warn).toHaveBeenCalledTimes(2);
  });

  it('warns through a createSession() clone when the parent has not seen the version', async () => {
    const sink = createSink();
    fetchMock.mockResolvedValue(jsonResponse(rawTool, { [HEADER]: GMAIL_ITEM }));
    const composio = createComposio({ logger: sink });
    const clone = composio.createSession({ headers: { 'x-request-id': 'r1' } });

    await clone.tools.getRawComposioToolBySlug('COMPOSIO_TOOL');

    expect(sink.warn).toHaveBeenCalledTimes(1);
    expect(warnMessages(sink)[0]).toContain('GMAIL version 20250114_00');
  });
});
