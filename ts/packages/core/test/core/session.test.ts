import {
  ComposioError as ClientComposioError,
  VERSION as clientLibraryVersion,
} from '@composio/client';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Composio } from '../../src/composio';
import { SessionConfigs } from '../../src/models/SessionConfigs';
import { MockProvider } from '../utils/mocks/provider.mock';
import { OpenAIProvider } from '../../src/provider/OpenAIProvider';
import { getClientIdentity } from '../../src/utils/session';
import { version } from '../../package.json';
import {
  ComposioAPIKeyKindError,
  ComposioNoAPIKeyError,
  ComposioScopeConfigError,
} from '../../src/errors/SDKErrors';
import { ComposioMCPDestinationError } from '../../src/errors/ToolRouterErrors';
import logger from '../../src/utils/logger';

const identityHeaders = (framework: string) => ({
  'x-client-provenance': '@composio/core',
  'x-client-version': version,
  'x-sdk-version': version,
  'x-client-language': 'typescript',
  'x-client-library': '@composio/client',
  'x-client-library-version': clientLibraryVersion,
  'x-client-runtime': 'nodejs',
  'x-runtime-version': process.versions.node,
  'x-runtime': 'NODEJS',
  'x-source': 'TYPESCRIPT_SDK',
  'x-framework': framework,
});

describe('Composio Session Management', () => {
  const baseConfig = {
    apiKey: 'test-api-key',
    baseURL: 'https://api.test.com',
    provider: new MockProvider(),
    allowTracking: false, // disable telemetry for tests
    allowTracing: false,
  };

  it('should create a new session with custom headers merged with session headers', () => {
    const composio = new Composio(baseConfig);
    const customHeaders = {
      headers: {
        'x-request-id': '1234567890',
        'x-correlation-id': 'session-abc-123',
        'x-custom-header': 'custom-value',
      },
    };
    const session = composio.createSession(customHeaders);

    // Should merge custom headers with session headers
    // @ts-expect-error: access private config for test
    const defaultHeaders = session.config.defaultHeaders;
    expect(defaultHeaders).toEqual({
      'x-request-id': '1234567890',
      'x-correlation-id': 'session-abc-123',
      'x-custom-header': 'custom-value',
    });

    // Should preserve other config
    // @ts-expect-error: access private config for test
    expect(session.config.apiKey).toBe(baseConfig.apiKey);
    // Should be a new instance
    expect(session).not.toBe(composio);
    // Should have the same provider instance
    expect(session.provider).toBe(composio.provider);
  });

  it('should inherit all configuration from the parent instance', () => {
    const composio = new Composio(baseConfig);
    const session = composio.createSession();
    // @ts-expect-error: access private config for test
    expect(session.config.apiKey).toBe(baseConfig.apiKey);
    // @ts-expect-error: access private config for test
    expect(session.config.baseURL).toBe(baseConfig.baseURL);
    // Should have the same provider instance
    expect(session.provider).toBe(composio.provider);
  });

  it('should allow multiple isolated sessions with different headers', () => {
    const composio = new Composio(baseConfig);
    const sessionA = composio.createSession({
      headers: { 'x-user-id': 'user-a', 'x-tenant-id': 'tenant-1' },
    });
    const sessionB = composio.createSession({
      headers: { 'x-user-id': 'user-b', 'x-tenant-id': 'tenant-2' },
    });

    // @ts-expect-error: access private config for test
    const headersA = sessionA.config.defaultHeaders;
    // @ts-expect-error: access private config for test
    const headersB = sessionB.config.defaultHeaders;

    // Each session should have its own custom headers merged with session headers
    expect(headersA).toEqual({
      'x-user-id': 'user-a',
      'x-tenant-id': 'tenant-1',
    });

    expect(headersB).toEqual({
      'x-user-id': 'user-b',
      'x-tenant-id': 'tenant-2',
    });

    // Sessions should be isolated
    expect(sessionA).not.toBe(sessionB);
  });

  it('should carry no default headers when no custom headers are provided', () => {
    const composio = new Composio(baseConfig);
    const session = composio.createSession();

    // The identity headers come from the client's `identity`, not defaultHeaders
    // @ts-expect-error: access private config for test
    const defaultHeaders = session.config.defaultHeaders;
    expect(defaultHeaders).toBeUndefined();
  });

  it('should expose sessions.create and keep composio.create as a bound alias', async () => {
    const composio = new Composio(baseConfig);
    const client = composio.getClient() as unknown;
    client.toolRouter.session.create = vi.fn().mockResolvedValue({
      session_id: 'session_123',
      mcp: {
        type: 'http',
        url: 'https://api.test.com/api/v3/tool_router/session/session_123/mcp',
      },
      config: {
        preload: { tools: [] },
      },
      config_version: 1,
    });

    expect(composio.toolRouter).toBe(composio.sessions);

    const sessionFromCanonicalApi = await composio.sessions.create('user_123');
    const sessionFromAlias = await composio.create('user_456');

    expect(client.toolRouter.session.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ user_id: 'user_123' }),
      undefined
    );
    expect(client.toolRouter.session.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ user_id: 'user_456' }),
      undefined
    );
    expect(sessionFromCanonicalApi.sessionId).toBe('session_123');
    expect(sessionFromAlias.sessionId).toBe('session_123');
  });

  it('should expose sessionConfigs as a SessionConfigs instance', () => {
    const composio = new Composio(baseConfig);

    expect(composio.sessionConfigs).toBeInstanceOf(SessionConfigs);
  });
});

describe('getClientIdentity', () => {
  const sdkIdentity = (framework: string) => ({
    product: '@composio/core',
    version,
    source: 'TYPESCRIPT_SDK',
    framework,
    runtime: 'NODEJS',
  });

  it('reports the OpenAI provider as the framework', () => {
    expect(getClientIdentity(new OpenAIProvider())).toEqual(sdkIdentity('openai'));
  });

  it('reports a custom provider by its name', () => {
    expect(getClientIdentity(new MockProvider())).toEqual(sdkIdentity('MockProvider'));
  });

  it('reports an unknown framework without a provider or a provider name', () => {
    expect(getClientIdentity(undefined)).toEqual(sdkIdentity('unknown'));
    expect(getClientIdentity({ name: undefined } as unknown as MockProvider)).toEqual(
      sdkIdentity('unknown')
    );
  });

  it('reports an unknown framework for a provider name the client cannot send', () => {
    for (const name of ['café', ' padded ', '', 'openai\n', 'openai\r\n']) {
      expect(getClientIdentity({ name } as unknown as MockProvider)).toEqual(
        sdkIdentity('unknown')
      );
    }
  });
});

describe('Identity headers at the transport boundary', () => {
  const captureFetch = () => {
    const fetchMock = vi.fn(async () => Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  const sentHeaders = (fetchMock: ReturnType<typeof captureFetch>) => {
    const call = fetchMock.mock.calls[0] as unknown as [string, { headers: HeadersInit }];
    return Object.fromEntries(new Headers(call[1].headers));
  };

  const build = (config: ConstructorParameters<typeof Composio>[0] = {}) =>
    new Composio({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
      provider: new MockProvider(),
      allowTracking: false,
      disableVersionCheck: true,
      ...config,
    });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the SDK identity, the provider as the framework, and the caller headers', async () => {
    const fetchMock = captureFetch();

    await build({ defaultHeaders: { 'x-request-id': 'req-1' } })
      .getClient()
      .toolkits.list({ limit: 1 });

    expect(sentHeaders(fetchMock)).toMatchObject({
      ...identityHeaders('MockProvider'),
      'x-request-id': 'req-1',
    });
  });

  it('sends the same identity from a createSession clone', async () => {
    const fetchMock = captureFetch();

    await build({ provider: new OpenAIProvider() })
      .createSession({ headers: { 'x-session': 's-1' } })
      .getClient()
      .toolkits.list({ limit: 1 });

    expect(sentHeaders(fetchMock)).toMatchObject({
      ...identityHeaders('openai'),
      'x-session': 's-1',
    });
  });

  it('rejects an identity header in defaultHeaders', () => {
    expect(() => build({ defaultHeaders: { 'x-source': 'custom-source' } })).toThrow(
      ClientComposioError
    );
    expect(() => build({ defaultHeaders: { 'X-Client-Library': 'other' } })).toThrow(
      ClientComposioError
    );
  });

  it('rejects an identity header passed to createSession', () => {
    expect(() => build().createSession({ headers: { 'x-framework': 'other' } })).toThrow(
      ClientComposioError
    );
  });
});

describe('Session Headers Configuration Integration', () => {
  it('should create Composio instance with correct session headers config for OpenAI provider', () => {
    const openAIProvider = new OpenAIProvider();
    const composio = new Composio({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
      provider: openAIProvider,
      allowTracking: false,
    });

    // Verify the provider and configuration are set correctly
    expect(composio.provider).toBe(openAIProvider);
    // @ts-expect-error: access private config for test
    expect(composio.config.provider).toBe(openAIProvider);
  });

  it('should create Composio instance with custom default headers merged with session headers', () => {
    const openAIProvider = new OpenAIProvider();
    const customHeaders = {
      'x-request-id': '1234567890',
      'x-correlation-id': 'correlation-123',
    };

    const composio = new Composio({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
      provider: openAIProvider,
      defaultHeaders: customHeaders,
      allowTracking: false,
    });

    // Verify the configuration includes custom headers
    // @ts-expect-error: access private config for test
    expect(composio.config.defaultHeaders).toEqual(customHeaders);
    expect(composio.provider).toBe(openAIProvider);
  });

  it('should create session instance with provider-specific configuration', () => {
    const openAIProvider = new OpenAIProvider();
    const composio = new Composio({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
      provider: openAIProvider,
      allowTracking: false,
    });

    const sessionHeaders = {
      'x-request-id': '1234567890',
      'x-user-context': 'user-session',
    };

    const session = composio.createSession({ headers: sessionHeaders });

    // Verify session inherits provider and has merged headers configuration
    expect(session.provider).toBe(openAIProvider);
    // @ts-expect-error: access private config for test
    const sessionDefaultHeaders = session.config.defaultHeaders;

    // Verify that session headers include both custom and provider-specific headers
    expect(sessionDefaultHeaders).toEqual({
      'x-request-id': '1234567890',
      'x-user-context': 'user-session',
    });
  });

  it('should maintain distinct provider configurations across sessions', () => {
    const openAIProvider = new OpenAIProvider();
    const mockProvider = new MockProvider();

    const composioOpenAI = new Composio({
      apiKey: 'test-api-key',
      provider: openAIProvider,
      allowTracking: false,
    });

    const composioMock = new Composio({
      apiKey: 'test-api-key',
      provider: mockProvider,
      allowTracking: false,
    });

    const sessionOpenAI = composioOpenAI.createSession({
      headers: { 'x-session': 'openai-session' },
    });

    const sessionMock = composioMock.createSession({
      headers: { 'x-session': 'mock-session' },
    });

    // Verify providers are maintained correctly
    expect(sessionOpenAI.provider).toBe(openAIProvider);
    expect(sessionMock.provider).toBe(mockProvider);

    // Each session carries its own headers; the provider reaches the wire through `identity`
    // @ts-expect-error: access private config for test
    expect(sessionOpenAI.config.defaultHeaders).toEqual({ 'x-session': 'openai-session' });
    // @ts-expect-error: access private config for test
    expect(sessionMock.config.defaultHeaders).toEqual({ 'x-session': 'mock-session' });
  });

  it('should create session with no default headers without custom headers', () => {
    const openAIProvider = new OpenAIProvider();
    const composio = new Composio({
      apiKey: 'test-api-key',
      provider: openAIProvider,
      allowTracking: false,
    });

    const session = composio.createSession();

    // Verify session has provider-specific configuration
    expect(session.provider).toBe(openAIProvider);
    // @ts-expect-error: access private config for test
    const sessionHeaders = session.config.defaultHeaders;

    expect(sessionHeaders).toBeUndefined();
  });

  it('should properly merge headers when both parent and session have custom headers', () => {
    const openAIProvider = new OpenAIProvider();

    // Create parent with default headers
    const composio = new Composio({
      apiKey: 'test-api-key',
      provider: openAIProvider,
      defaultHeaders: {
        'x-parent-header': 'parent-value',
        'x-shared-header': 'parent-shared-value',
      },
      allowTracking: false,
    });

    // Create session with additional headers
    const session = composio.createSession({
      headers: {
        'x-session-header': 'session-value',
        'x-shared-header': 'session-shared-value', // should override parent
      },
    });

    // @ts-expect-error: access private config for test
    const sessionHeaders = session.config.defaultHeaders;

    expect(sessionHeaders).toEqual({
      'x-session-header': 'session-value',
      'x-shared-header': 'session-shared-value', // session value takes precedence
    });
  });
});

describe('Credential resolution at the transport boundary', () => {
  let home: string;
  const userKey = 'uak_cliUserKeyValue';
  const projectKey = 'ak_explicitProjectKey';

  const writeUserData = (contents: Record<string, unknown>) => {
    const dir = path.join(home, '.composio');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'user_data.json'), JSON.stringify(contents));
  };

  const captureFetch = () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ slug: 'github', name: 'GitHub', meta: {}, is_local_toolkit: false })
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  const capturedHeaders = (fetchMock: ReturnType<typeof captureFetch>, callIndex = 0) => {
    const call = fetchMock.mock.calls[callIndex] as unknown as [string, { headers: HeadersInit }];
    return new Headers(call[1].headers);
  };

  const build = (config: ConstructorParameters<typeof Composio>[0]) =>
    new Composio({
      baseURL: 'https://api.test.com',
      provider: new MockProvider(),
      allowTracking: false,
      disableVersionCheck: true,
      ...config,
    });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-credentials-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('COMPOSIO_API_KEY', undefined);
    vi.stubEnv('COMPOSIO_BASE_URL', undefined);
    vi.stubEnv('COMPOSIO_USER_API_KEY', undefined);
    vi.stubEnv('COMPOSIO_ORG_API_KEY', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('sends the explicit project key even when a CLI user key is stored on disk', async () => {
    writeUserData({ api_key: userKey });
    const fetchMock = captureFetch();

    await build({ apiKey: projectKey }).getClient().toolkits.retrieve('github');

    const headers = capturedHeaders(fetchMock);
    expect(headers.get('x-api-key')).toBe(projectKey);
    expect(headers.get('x-user-api-key')).toBeNull();
  });

  it('never sends a stored CLI user key as the project key', () => {
    writeUserData({ api_key: userKey });
    const fetchMock = captureFetch();

    expect(() => build({})).toThrow(ComposioAPIKeyKindError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the user API key when the project key is disabled via the userApiKey option', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignEnvKey');
    writeUserData({ api_key: 'ak_foreignDiskKey' });
    const fetchMock = captureFetch();

    const composio = build({ apiKey: null, userApiKey: userKey });
    await composio.getClient().toolkits.retrieve('github');

    const headers = capturedHeaders(fetchMock);
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('x-user-api-key')).toBe(userKey);
    expect(composio.getConfig().apiKey).toBeNull();
    expect(composio.getClient().authMode).toBe('user');
  });

  it('sends only the user API key header when the project key is disabled via defaultHeaders', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignEnvKey');
    writeUserData({ api_key: 'ak_foreignDiskKey' });
    const fetchMock = captureFetch();

    const composio = build({ apiKey: null, defaultHeaders: { 'x-user-api-key': userKey } });
    await composio.getClient().toolkits.retrieve('github');

    const headers = capturedHeaders(fetchMock);
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('x-user-api-key')).toBe(userKey);
    expect(composio.getConfig().apiKey).toBeNull();
  });

  it('rejects a disabled project key without any user credential', () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignEnvKey');

    expect(() => build({ apiKey: null })).toThrow(ComposioNoAPIKeyError);
  });

  it('rejects a raw project key header when the project key is disabled', () => {
    const fetchMock = captureFetch();

    expect(() =>
      build({ apiKey: null, userApiKey: userKey, defaultHeaders: { 'X-Api-Key': projectKey } })
    ).toThrow(ComposioNoAPIKeyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not let a clone reintroduce a raw project key header', async () => {
    const fetchMock = captureFetch();
    const composio = build({ apiKey: null, userApiKey: userKey });

    expect(() => composio.createSession({ headers: { 'x-api-key': projectKey } })).toThrow(
      ComposioNoAPIKeyError
    );
    await composio.getClient().toolkits.retrieve('github');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = capturedHeaders(fetchMock);
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('x-user-api-key')).toBe(userKey);
  });

  it('keeps the resolved project key on clones when the environment changes later', async () => {
    const fetchMock = captureFetch();
    const composio = build({ apiKey: projectKey });

    vi.stubEnv('COMPOSIO_API_KEY', 'ak_laterEnvKey');
    const clone = composio.createSession({ headers: { 'x-request-id': 'req-1' } });
    await clone.getClient().toolkits.retrieve('github');

    const headers = capturedHeaders(fetchMock);
    expect(headers.get('x-api-key')).toBe(projectKey);
    expect(headers.get('x-request-id')).toBe('req-1');
  });

  it('keeps the project key disabled on clones built from the userApiKey option', async () => {
    const fetchMock = captureFetch();
    const composio = build({ apiKey: null, userApiKey: userKey });

    vi.stubEnv('COMPOSIO_API_KEY', 'ak_laterEnvKey');
    const clone = composio.createSession({ headers: { 'x-request-id': 'req-2' } });
    await clone.getClient().toolkits.retrieve('github');

    const headers = capturedHeaders(fetchMock);
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('x-user-api-key')).toBe(userKey);
    expect(headers.get('x-request-id')).toBe('req-2');
    expect(clone.getConfig().apiKey).toBeNull();
  });

  it('keeps the project key disabled on clones built from the user API key header', async () => {
    const fetchMock = captureFetch();
    const composio = build({ apiKey: null, defaultHeaders: { 'x-user-api-key': userKey } });

    vi.stubEnv('COMPOSIO_API_KEY', 'ak_laterEnvKey');
    const clone = composio.createSession({ headers: { 'x-request-id': 'req-3' } });
    await clone.getClient().toolkits.retrieve('github');

    const headers = capturedHeaders(fetchMock);
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('x-user-api-key')).toBe(userKey);
    expect(headers.get('x-request-id')).toBe('req-3');
    expect(clone.getConfig().apiKey).toBeNull();
  });

  describe('MCP export follows the effective session auth context', () => {
    const orgId = 'org_nano_abc';
    const projectId = 'proj_nano_xyz';
    const sameOriginMcp = 'https://api.test.com/api/v3/tool_router/session/session_mcp/mcp';

    const sessionResponse = (mcpUrl: string) => ({
      session_id: 'session_mcp',
      mcp: { type: 'http', url: mcpUrl },
      config: { user_id: 'user_123', execute: {}, search: {}, preload: { tools: [] } },
      config_version: 1,
      warnings: [],
    });

    const captureSessionFetch = (mcpUrl: string = sameOriginMcp) => {
      const fetchMock = vi.fn(async () => Response.json(sessionResponse(mcpUrl)));
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    };

    it('exports only the user API key when the project key is disabled and a foreign key is ambient', async () => {
      vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignEnvKey');
      writeUserData({ api_key: 'ak_foreignDiskKey' });
      const fetchMock = captureSessionFetch();

      const composio = build({ apiKey: null, userApiKey: userKey });
      const session = await composio.sessions.create('user_123', { mcp: true });

      const requestHeaders = capturedHeaders(fetchMock);
      expect(requestHeaders.get('x-api-key')).toBeNull();
      expect(requestHeaders.get('x-user-api-key')).toBe(userKey);
      expect(requestHeaders.get('x-org-id')).toBeNull();
      expect(requestHeaders.get('x-project-id')).toBeNull();
      expect(session.mcp.url).toBe(sameOriginMcp);
      expect(session.mcp.headers).toEqual({ 'x-user-api-key': userKey });
    });

    it('exports the user API key placed in defaultHeaders when the project key is disabled', async () => {
      vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignEnvKey');
      const fetchMock = captureSessionFetch();

      const composio = build({ apiKey: null, defaultHeaders: { 'x-user-api-key': userKey } });
      const session = await composio.sessions.create('user_123', { mcp: true });

      expect(capturedHeaders(fetchMock).get('x-api-key')).toBeNull();
      expect(capturedHeaders(fetchMock).get('x-user-api-key')).toBe(userKey);
      expect(session.mcp.headers).toEqual({ 'x-user-api-key': userKey });
    });

    it('exports the organization API key placed in defaultHeaders when it is the only credential', async () => {
      const orgKey = 'oak_headerOrgKey';
      const fetchMock = captureSessionFetch();

      const composio = build({ apiKey: null, defaultHeaders: { 'x-org-api-key': orgKey } });
      const session = await composio.sessions.create('user_123', { mcp: true });

      expect(capturedHeaders(fetchMock).get('x-api-key')).toBeNull();
      expect(capturedHeaders(fetchMock).get('x-org-api-key')).toBe(orgKey);
      expect(session.mcp.headers).toEqual({ 'x-org-api-key': orgKey });
    });

    it('exports the user API key a clone was given over the key the parent resolved', async () => {
      const otherUserKey = 'uak_overridingUserKey';
      const fetchMock = captureSessionFetch();

      const composio = build({ apiKey: null, userApiKey: userKey });
      const clone = composio.createSession({ headers: { 'x-user-api-key': otherUserKey } });
      const session = await clone.sessions.create('user_123', { mcp: true });

      const requestHeaders = capturedHeaders(fetchMock);
      expect(requestHeaders.get('x-api-key')).toBeNull();
      expect(requestHeaders.get('x-user-api-key')).toBe(otherUserKey);
      expect(session.mcp.headers).toEqual({ 'x-user-api-key': otherUserKey });
    });

    it('exports the user API key placed in defaultHeaders over a configured project key', async () => {
      const fetchMock = captureSessionFetch();

      const composio = build({ apiKey: projectKey, defaultHeaders: { 'x-user-api-key': userKey } });
      const session = await composio.sessions.create('user_123', { mcp: true });

      const requestHeaders = capturedHeaders(fetchMock);
      expect(requestHeaders.get('x-api-key')).toBeNull();
      expect(requestHeaders.get('x-user-api-key')).toBe(userKey);
      expect(session.mcp.headers).toEqual({ 'x-user-api-key': userKey });
    });

    it('sends and exports the org/project scope headers together with the user key', async () => {
      vi.stubEnv('COMPOSIO_API_KEY', 'ak_foreignEnvKey');
      const fetchMock = captureSessionFetch();

      const composio = build({ apiKey: null, userApiKey: userKey, orgId, projectId });
      const session = await composio.sessions.create('user_123', { mcp: true });

      const requestHeaders = capturedHeaders(fetchMock);
      expect(requestHeaders.get('x-api-key')).toBeNull();
      expect(requestHeaders.get('x-user-api-key')).toBe(userKey);
      expect(requestHeaders.get('x-org-id')).toBe(orgId);
      expect(requestHeaders.get('x-project-id')).toBe(projectId);
      expect(session.mcp.headers).toEqual({
        'x-user-api-key': userKey,
        'x-org-id': orgId,
        'x-project-id': projectId,
      });
      expect(composio.getConfig().orgId).toBe(orgId);
      expect(composio.getConfig().projectId).toBe(projectId);
    });

    it('rejects a half-configured scope', () => {
      expect(() => build({ apiKey: null, userApiKey: userKey, orgId })).toThrow(
        ComposioScopeConfigError
      );
      expect(() => build({ apiKey: null, userApiKey: userKey, projectId })).toThrow(
        ComposioScopeConfigError
      );
    });

    it('rejects a scope option that disagrees with the same header in defaultHeaders', () => {
      expect(() =>
        build({
          apiKey: null,
          userApiKey: userKey,
          orgId,
          projectId,
          defaultHeaders: { 'X-Org-Id': 'org_nano_other' },
        })
      ).toThrow(ComposioScopeConfigError);
    });

    it('adopts a scope supplied through defaultHeaders as the single header source', async () => {
      const fetchMock = captureSessionFetch();

      const composio = build({
        apiKey: null,
        userApiKey: userKey,
        defaultHeaders: { 'x-org-id': orgId, 'x-project-id': projectId },
      });
      const session = await composio.sessions.create('user_123', { mcp: true });

      const requestHeaders = capturedHeaders(fetchMock);
      expect(requestHeaders.get('x-org-id')).toBe(orgId);
      expect(requestHeaders.get('x-project-id')).toBe(projectId);
      expect(composio.getConfig().orgId).toBe(orgId);
      expect(composio.getConfig().projectId).toBe(projectId);
      expect(session.mcp.headers).toEqual({
        'x-user-api-key': userKey,
        'x-org-id': orgId,
        'x-project-id': projectId,
      });
    });

    it('exports only the project key for project-key sessions', async () => {
      const fetchMock = captureSessionFetch();

      const composio = build({
        apiKey: projectKey,
        defaultHeaders: { 'x-request-id': 'req-9', 'x-tenant': 'acme' },
      });
      const session = await composio.sessions.create('user_123', { mcp: true });

      expect(capturedHeaders(fetchMock).get('x-api-key')).toBe(projectKey);
      expect(session.mcp.headers).toEqual({ 'x-api-key': projectKey });
    });

    it('never copies unrelated default headers into the MCP config', async () => {
      captureSessionFetch();

      const composio = build({
        apiKey: null,
        defaultHeaders: {
          'x-user-api-key': userKey,
          'x-request-id': 'req-9',
          authorization: 'Bearer other',
        },
      });
      const session = await composio.sessions.create('user_123', { mcp: true });

      expect(session.mcp.headers).toEqual({ 'x-user-api-key': userKey });
    });

    it('throws when the MCP URL is on a different origin and the caller asked for MCP', async () => {
      captureSessionFetch('https://mcp.example.com/session_mcp');
      const composio = build({ apiKey: projectKey });

      const failure = await composio.sessions.create('user_123', { mcp: true }).catch(e => e);

      expect(failure).toBeInstanceOf(ComposioMCPDestinationError);
      expect(failure.message).toBe(
        'The session MCP endpoint origin https://mcp.example.com does not match the API origin https://api.test.com; the session credential was not attached'
      );
      expect(failure.meta).toEqual({
        mcpOrigin: 'https://mcp.example.com',
        apiOrigin: 'https://api.test.com',
      });
      expect(JSON.stringify(failure)).not.toContain(projectKey);
    });

    it('throws from use() as well when the caller asked for MCP on a different origin', async () => {
      captureSessionFetch('https://mcp.example.com/session_mcp');
      const composio = build({ apiKey: projectKey });

      const failure = await composio.sessions.use('session_mcp', { mcp: true }).catch(e => e);

      expect(failure).toBeInstanceOf(ComposioMCPDestinationError);
      expect(failure.message).toBe(
        'The session MCP endpoint origin https://mcp.example.com does not match the API origin https://api.test.com; the session credential was not attached'
      );
      expect(JSON.stringify(failure)).not.toContain(projectKey);
    });

    it('does not warn for a same-origin MCP URL', async () => {
      captureSessionFetch(sameOriginMcp);
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const composio = build({ apiKey: projectKey });

      const session = await composio.sessions.create('user_123');

      expect((session as unknown as { mcp: { headers: unknown } }).mcp.headers).toEqual({
        'x-api-key': projectKey,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns the session with empty MCP headers and warns when the caller did not ask for MCP', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      captureSessionFetch('https://mcp.example.com/session_mcp');
      const composio = build({ apiKey: projectKey });

      const created = await composio.sessions.create('user_123');
      const used = await composio.sessions.use('session_mcp');

      const createdMcp = (created as unknown as { mcp: { url: string; headers: unknown } }).mcp;
      const usedMcp = (used as unknown as { mcp: { url: string; headers: unknown } }).mcp;
      expect(createdMcp).toEqual({
        type: 'http',
        url: 'https://mcp.example.com/session_mcp',
        headers: {},
      });
      expect(usedMcp.headers).toEqual({});
      expect(warnSpy).toHaveBeenCalledTimes(2);
      const warning = String(warnSpy.mock.calls[0][0]);
      expect(warning).toBe(
        'The session MCP endpoint origin https://mcp.example.com does not match the API origin https://api.test.com; the session credential was not attached. session.mcp.headers was left empty; pass `mcp: true` to make this an error'
      );
      expect(warning).not.toContain(projectKey);
    });

    it('rejects an MCP URL with an opaque origin before comparing origins', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      captureSessionFetch('data:text/plain,session_mcp');
      const composio = build({ apiKey: projectKey });

      const failure = await composio.sessions.create('user_123', { mcp: true }).catch(e => e);
      expect(failure).toBeInstanceOf(ComposioMCPDestinationError);
      expect(failure.message).toBe('The MCP URL has an opaque origin');
      expect(failure.meta).toEqual({ role: 'MCP URL' });
      expect(JSON.stringify(failure)).not.toContain(projectKey);

      const session = await composio.sessions.create('user_123');
      const mcp = (session as unknown as { mcp: { headers: unknown } }).mcp;
      expect(mcp.headers).toEqual({});
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('opaque origin');
    });

    it('exports credentials to a same-origin https MCP URL as before', async () => {
      captureSessionFetch(sameOriginMcp);
      const composio = build({ apiKey: projectKey, baseURL: 'https://api.test.com' });

      const session = await composio.sessions.create('user_123', { mcp: true });

      expect(session.mcp).toEqual({
        type: 'http',
        url: sameOriginMcp,
        headers: { 'x-api-key': projectKey },
      });
    });

    it('exports credentials to a same-origin MCP URL on a plain-http custom base URL', async () => {
      const fetchMock = captureSessionFetch(
        'http://localhost:3000/api/v3/tool_router/session/session_mcp/mcp'
      );
      const composio = build({ apiKey: projectKey, baseURL: 'http://localhost:3000' });

      const session = await composio.sessions.create('user_123', { mcp: true });

      expect(capturedHeaders(fetchMock).get('x-api-key')).toBe(projectKey);
      expect(session.mcp.headers).toEqual({ 'x-api-key': projectKey });
    });

    it('keeps the disabled project key and scope when a clone retrieves a session after the environment changes', async () => {
      const fetchMock = captureSessionFetch();
      const composio = build({ apiKey: null, userApiKey: userKey, orgId, projectId });

      vi.stubEnv('COMPOSIO_API_KEY', 'ak_laterEnvKey');
      const clone = composio.createSession({ headers: { 'x-request-id': 'req-3' } });
      const session = await clone.sessions.use('session_mcp', { mcp: true });

      const requestHeaders = capturedHeaders(fetchMock);
      expect(requestHeaders.get('x-api-key')).toBeNull();
      expect(requestHeaders.get('x-user-api-key')).toBe(userKey);
      expect(requestHeaders.get('x-org-id')).toBe(orgId);
      expect(requestHeaders.get('x-project-id')).toBe(projectId);
      expect(requestHeaders.get('x-request-id')).toBe('req-3');
      expect(session.mcp.headers).toEqual({
        'x-user-api-key': userKey,
        'x-org-id': orgId,
        'x-project-id': projectId,
      });
    });
  });
});
