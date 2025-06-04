import { describe, it, expect, vi } from 'vitest';
import { Composio } from '../../src/composio';
import { MockProvider } from '../utils/mocks/provider.mock';

describe('Composio Session Management', () => {
  const baseConfig = {
    apiKey: 'test-api-key',
    baseURL: 'https://api.test.com',
    provider: new MockProvider(),
    allowTracking: false, // disable telemetry for tests
    allowTracing: false,
  };

  it('should create a new session with custom headers', () => {
    const composio = new Composio(baseConfig);
    const customHeaders = {
      headers: {
        'x-request-id': '1234567890',
        'x-correlation-id': 'session-abc-123',
        'x-custom-header': 'custom-value',
      },
    };
    const session = composio.createSession(customHeaders);
    // @ts-expect-error: access private config for test
    expect(session.config.defaultHeaders).toEqual(customHeaders.headers);
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
    expect(sessionA.config.defaultHeaders['x-user-id']).toBe('user-a');
    // @ts-expect-error: access private config for test
    expect(sessionB.config.defaultHeaders['x-user-id']).toBe('user-b');
    // Sessions should be isolated
    expect(sessionA).not.toBe(sessionB);
  });

  it('should default to parent config if no defaultHeaders are provided', () => {
    const composio = new Composio(baseConfig);
    const session = composio.createSession();
    // @ts-expect-error: access private config for test
    expect(session.config.defaultHeaders).toBeUndefined();
  });
});
