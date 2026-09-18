import { describe, it, expect, afterEach, vi } from 'vitest';
import { Composio } from '../../src/composio';
import { MockProvider } from '../utils/mocks/provider.mock';

/**
 * `userApiKey` / `orgApiKey` are forwarded to the API client, which selects the
 * credential per operation and resolves the env fallbacks itself.
 */
describe('Composio user and organization API keys', () => {
  const baseConfig = {
    apiKey: 'ak_test',
    baseURL: 'https://api.test.com',
    provider: new MockProvider(),
    allowTracking: false,
    disableVersionCheck: true,
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards both keys to the API client', () => {
    const composio = new Composio({
      ...baseConfig,
      userApiKey: 'uak_test',
      orgApiKey: 'oak_test',
    });
    const client = composio.getClient();
    expect(client.apiKey).toBe('ak_test');
    expect(client.userApiKey).toBe('uak_test');
    expect(client.orgApiKey).toBe('oak_test');
  });

  it('leaves both keys unset on the client when not configured', () => {
    vi.stubEnv('COMPOSIO_USER_API_KEY', '');
    vi.stubEnv('COMPOSIO_ORG_API_KEY', '');
    const client = new Composio(baseConfig).getClient();
    expect(client.userApiKey).toBeNull();
    expect(client.orgApiKey).toBeNull();
  });

  it('lets the client resolve the env fallbacks', () => {
    vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_env');
    vi.stubEnv('COMPOSIO_ORG_API_KEY', 'oak_env');
    const client = new Composio(baseConfig).getClient();
    expect(client.userApiKey).toBe('uak_env');
    expect(client.orgApiKey).toBe('oak_env');
  });

  it('exposes both keys on getConfig() and carries them into createSession()', () => {
    const composio = new Composio({
      ...baseConfig,
      userApiKey: 'uak_test',
      orgApiKey: 'oak_test',
    });
    expect(composio.getConfig()).toMatchObject({ userApiKey: 'uak_test', orgApiKey: 'oak_test' });
    const session = composio.createSession({ headers: { 'x-request-id': '1' } });
    expect(session.getConfig()).toMatchObject({ userApiKey: 'uak_test', orgApiKey: 'oak_test' });
    expect(session.getClient().userApiKey).toBe('uak_test');
    expect(session.getClient().orgApiKey).toBe('oak_test');
  });
});
