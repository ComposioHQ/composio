import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Composio } from '../../src/composio';
import { MockProvider } from '../utils/mocks/provider.mock';
import { OpenAIProvider } from '../../src/provider/OpenAIProvider';
import { getDefaultHeaders, getSessionHeaders } from '../../src/utils/session';
import { version } from '../../package.json';
import { ComposioAPIKeyKindError, ComposioNoAPIKeyError } from '../../src/errors/SDKErrors';

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
      'x-framework': 'MockProvider', // from provider
      'x-source': 'TYPESCRIPT_SDK',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
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
      'x-framework': 'MockProvider',
      'x-source': 'TYPESCRIPT_SDK',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
    });

    expect(headersB).toEqual({
      'x-user-id': 'user-b',
      'x-tenant-id': 'tenant-2',
      'x-framework': 'MockProvider',
      'x-source': 'TYPESCRIPT_SDK',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
    });

    // Sessions should be isolated
    expect(sessionA).not.toBe(sessionB);
  });

  it('should include session headers even when no custom headers are provided', () => {
    const composio = new Composio(baseConfig);
    const session = composio.createSession();

    // Should still have session headers from provider
    // @ts-expect-error: access private config for test
    const defaultHeaders = session.config.defaultHeaders;
    expect(defaultHeaders).toEqual({
      'x-framework': 'MockProvider', // from provider
      'x-source': 'TYPESCRIPT_SDK',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
    });
  });

  it('should expose sessions.create and keep composio.create as a bound alias', async () => {
    const composio = new Composio(baseConfig);
    const client = composio.getClient() as unknown;
    client.toolRouter.session.create = vi.fn().mockResolvedValue({
      session_id: 'session_123',
      mcp: {
        type: 'http',
        url: 'https://mcp.example.com/session_123',
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
});

describe('Session Headers Generation', () => {
  describe('getSessionHeaders', () => {
    it('should generate correct session headers for OpenAI provider', () => {
      const openAIProvider = new OpenAIProvider();
      const headers = getSessionHeaders(openAIProvider);

      expect(headers).toEqual({
        'x-framework': 'openai',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should generate correct session headers for MockProvider', () => {
      const mockProvider = new MockProvider();
      const headers = getSessionHeaders(mockProvider);

      expect(headers).toEqual({
        'x-framework': 'MockProvider',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should use fallback source when provider is undefined', () => {
      const headers = getSessionHeaders(undefined);

      expect(headers).toEqual({
        'x-framework': 'unknown',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should use fallback source when provider name is undefined', () => {
      const mockProvider = {
        name: undefined,
      } as unknown;
      const headers = getSessionHeaders(mockProvider);

      expect(headers).toEqual({
        'x-framework': 'unknown',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });
  });

  describe('getDefaultHeaders', () => {
    it('should merge custom headers with session headers for OpenAI provider', () => {
      const openAIProvider = new OpenAIProvider();
      const customHeaders = {
        'x-request-id': '1234567890',
        'x-custom-header': 'custom-value',
      };

      const headers = getDefaultHeaders(customHeaders, openAIProvider);

      expect(headers).toEqual({
        'x-request-id': '1234567890',
        'x-custom-header': 'custom-value',
        'x-framework': 'openai',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should merge custom headers with session headers for MockProvider', () => {
      const mockProvider = new MockProvider();
      const customHeaders = {
        'x-user-id': 'user-123',
        'x-tenant-id': 'tenant-456',
      };

      const headers = getDefaultHeaders(customHeaders, mockProvider);

      expect(headers).toEqual({
        'x-user-id': 'user-123',
        'x-tenant-id': 'tenant-456',
        'x-framework': 'MockProvider',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should prioritize session headers over custom headers when keys conflict', () => {
      const openAIProvider = new OpenAIProvider();
      const customHeaders = {
        'x-source': 'custom-source',
        'x-runtime': 'custom-runtime',
        'x-sdk-version': 'custom-version',
        'x-custom-header': 'custom-value',
      };

      const headers = getDefaultHeaders(customHeaders, openAIProvider);

      expect(headers).toEqual({
        'x-framework': 'openai', // session header takes precedence
        'x-source': 'TYPESCRIPT_SDK', // session header takes precedence
        'x-runtime': 'NODEJS', // session header takes precedence
        'x-sdk-version': version, // session header takes precedence
        'x-custom-header': 'custom-value', // custom header preserved
      });
    });

    it('should handle undefined custom headers', () => {
      const openAIProvider = new OpenAIProvider();
      const headers = getDefaultHeaders(undefined, openAIProvider);

      expect(headers).toEqual({
        'x-framework': 'openai',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should handle empty custom headers object', () => {
      const openAIProvider = new OpenAIProvider();
      const headers = getDefaultHeaders({}, openAIProvider);

      expect(headers).toEqual({
        'x-framework': 'openai',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should handle undefined provider', () => {
      const customHeaders = {
        'x-request-id': '1234567890',
      };

      const headers = getDefaultHeaders(customHeaders, undefined);

      expect(headers).toEqual({
        'x-request-id': '1234567890',
        'x-framework': 'unknown',
        'x-source': 'TYPESCRIPT_SDK',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });
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
      'x-framework': 'openai',
      'x-source': 'TYPESCRIPT_SDK',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
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

    // Verify session configurations have provider-specific headers
    // @ts-expect-error: access private config for test
    const openAIHeaders = sessionOpenAI.config.defaultHeaders!;
    // @ts-expect-error: access private config for test
    const mockHeaders = sessionMock.config.defaultHeaders!;

    expect(openAIHeaders['x-framework']).toBe('openai');
    expect(openAIHeaders['x-session']).toBe('openai-session');

    expect(mockHeaders['x-framework']).toBe('MockProvider');
    expect(mockHeaders['x-session']).toBe('mock-session');
  });

  it('should create session with provider-specific headers even without custom headers', () => {
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

    expect(sessionHeaders).toEqual({
      'x-framework': 'openai',
      'x-source': 'TYPESCRIPT_SDK',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
    });
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
      'x-framework': 'openai', // provider-specific header
      'x-source': 'TYPESCRIPT_SDK',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
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
    expect(composio.getClient().apiKey).toBeNull();
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

  it('exports no project key header for MCP when the project key is disabled', async () => {
    const composio = build({ apiKey: null, userApiKey: userKey });
    const client = composio.getClient() as unknown;
    client.toolRouter.session.create = vi.fn().mockResolvedValue({
      session_id: 'session_null_key',
      mcp: { type: 'http', url: 'https://mcp.example.com/session_null_key' },
      config: { preload: { tools: [] } },
      config_version: 1,
    });

    const session = await composio.sessions.create('user_123');

    expect(session.mcp.headers).not.toHaveProperty('x-api-key');
  });
});
