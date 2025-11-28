import { describe, it, expect, vi } from 'vitest';
import { Composio } from '../../src/composio';
import { MockProvider } from '../utils/mocks/provider.mock';
import { OpenAIProvider } from '../../src/provider/OpenAIProvider';
import { getDefaultHeaders, getSessionHeaders } from '../../src/utils/session';
import { version } from '../../package.json';

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
      'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
      'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
    });

    expect(headersB).toEqual({
      'x-user-id': 'user-b',
      'x-tenant-id': 'tenant-2',
      'x-framework': 'MockProvider',
      'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
      'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
    });
  });
});

describe('Session Headers Generation', () => {
  describe('getSessionHeaders', () => {
    it('should generate correct session headers for OpenAI provider', () => {
      const openAIProvider = new OpenAIProvider();
      const headers = getSessionHeaders(openAIProvider);

      expect(headers).toEqual({
        'x-framework': 'openai',
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should generate correct session headers for MockProvider', () => {
      const mockProvider = new MockProvider();
      const headers = getSessionHeaders(mockProvider);

      expect(headers).toEqual({
        'x-framework': 'MockProvider',
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should use fallback source when provider is undefined', () => {
      const headers = getSessionHeaders(undefined);

      expect(headers).toEqual({
        'x-framework': 'unknown',
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should use fallback source when provider name is undefined', () => {
      const mockProvider = {
        name: undefined,
      } as any;
      const headers = getSessionHeaders(mockProvider);

      expect(headers).toEqual({
        'x-framework': 'unknown',
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT', // session header takes precedence
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
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
        'x-runtime': 'NODEJS',
        'x-sdk-version': version,
      });
    });

    it('should handle empty custom headers object', () => {
      const openAIProvider = new OpenAIProvider();
      const headers = getDefaultHeaders({}, openAIProvider);

      expect(headers).toEqual({
        'x-framework': 'openai',
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
        'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
      'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
      'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
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
      'x-source': 'COMPOSIO_SDK_TYPESCRIPT',
      'x-runtime': 'NODEJS',
      'x-sdk-version': version,
    });
  });
});
