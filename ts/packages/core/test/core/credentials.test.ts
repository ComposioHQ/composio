import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { ComposioError as ClientComposioError } from '@composio/client';
import { Composio } from '../../src/composio';
import { MockProvider } from '../utils/mocks/provider.mock';
import { ComposioError } from '../../src/errors/ComposioError';
import { ComposioNoAPIKeyError, ComposioScopeConfigError } from '../../src/errors/SDKErrors';

/**
 * The SDK resolves its credentials (options, environment fallbacks, and a
 * credential default header) and hands the API client a single `auth`, plus
 * the resolved org/project scope as `scope`. Neither travels through the
 * client's `defaultHeaders`, which refuses those names.
 */
describe('Composio credentials and scope', () => {
  const baseConfig = {
    apiKey: 'ak_test',
    baseURL: 'https://api.test.com',
    provider: new MockProvider(),
    allowTracking: false,
    disableVersionCheck: true,
  };

  const captureFetch = () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  const sentHeaders = (fetchMock: ReturnType<typeof captureFetch>, callIndex = 0) => {
    const call = fetchMock.mock.calls[callIndex] as unknown as [string, { headers: HeadersInit }];
    return new Headers(call[1].headers);
  };

  const credentialHeaders = (headers: Headers) => ({
    'x-api-key': headers.get('x-api-key'),
    'x-user-api-key': headers.get('x-user-api-key'),
    'x-org-api-key': headers.get('x-org-api-key'),
  });

  beforeEach(() => {
    vi.stubEnv('COMPOSIO_API_KEY', undefined);
    vi.stubEnv('COMPOSIO_USER_API_KEY', undefined);
    vi.stubEnv('COMPOSIO_ORG_API_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('auth mapping', () => {
    it('authenticates every request with the project key when it is the only key', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio(baseConfig);

      expect(composio.getClient().authMode).toBe('project');
      await composio.getClient().toolRouter.session.retrieve('trs_1');
      await composio.getClient().org.list();

      expect(credentialHeaders(sentHeaders(fetchMock, 0))).toEqual({
        'x-api-key': 'ak_test',
        'x-user-api-key': null,
        'x-org-api-key': null,
      });
      expect(credentialHeaders(sentHeaders(fetchMock, 1))).toEqual({
        'x-api-key': 'ak_test',
        'x-user-api-key': null,
        'x-org-api-key': null,
      });
    });

    it('selects per operation when the project key comes with a user key', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({ ...baseConfig, userApiKey: 'uak_test' });

      expect(composio.getClient().authMode).toBe('auto');
      await composio.getClient().toolRouter.session.retrieve('trs_1');
      await composio.getClient().org.list();

      expect(credentialHeaders(sentHeaders(fetchMock, 0))).toEqual({
        'x-api-key': 'ak_test',
        'x-user-api-key': null,
        'x-org-api-key': null,
      });
      expect(credentialHeaders(sentHeaders(fetchMock, 1))).toEqual({
        'x-api-key': null,
        'x-user-api-key': 'uak_test',
        'x-org-api-key': null,
      });
    });

    it('selects per operation when the project key comes with an organization key', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({ ...baseConfig, orgApiKey: 'oak_test' });

      expect(composio.getClient().authMode).toBe('auto');
      await composio.getClient().toolkits.retrieve('github');
      await composio.getClient().org.owner.project.list();

      expect(sentHeaders(fetchMock, 0).get('x-api-key')).toBe('ak_test');
      expect(credentialHeaders(sentHeaders(fetchMock, 1))).toEqual({
        'x-api-key': null,
        'x-user-api-key': null,
        'x-org-api-key': 'oak_test',
      });
    });

    it('selects per operation with all three keys, resolving the alternates from the environment', async () => {
      vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_env');
      vi.stubEnv('COMPOSIO_ORG_API_KEY', 'oak_env');
      const fetchMock = captureFetch();
      const composio = new Composio(baseConfig);

      expect(composio.getClient().authMode).toBe('auto');
      await composio.getClient().org.list();
      await composio.getClient().org.owner.project.list();

      expect(sentHeaders(fetchMock, 0).get('x-user-api-key')).toBe('uak_env');
      expect(sentHeaders(fetchMock, 1).get('x-org-api-key')).toBe('oak_env');
    });

    it('authenticates every request, sessions included, with the user key when the project key is disabled', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({ ...baseConfig, apiKey: null, userApiKey: 'uak_test' });

      expect(composio.getClient().authMode).toBe('user');
      await composio.getClient().toolRouter.session.retrieve('trs_1');

      expect(credentialHeaders(sentHeaders(fetchMock))).toEqual({
        'x-api-key': null,
        'x-user-api-key': 'uak_test',
        'x-org-api-key': null,
      });
    });

    it('reads COMPOSIO_USER_API_KEY when the project key is disabled and the option is omitted', () => {
      vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_env');

      const composio = new Composio({ ...baseConfig, apiKey: null });

      expect(composio.getClient().authMode).toBe('user');
      expect(composio.getConfig()).toMatchObject({ apiKey: null, userApiKey: 'uak_env' });
    });

    it('keeps the user key on every request when an organization key is also configured', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({
        ...baseConfig,
        apiKey: null,
        userApiKey: 'uak_test',
        orgApiKey: 'oak_test',
      });

      expect(composio.getClient().authMode).toBe('user');
      await composio.getClient().toolRouter.session.retrieve('trs_1');
      await composio.getClient().org.owner.project.list();

      expect(credentialHeaders(sentHeaders(fetchMock, 0))).toEqual({
        'x-api-key': null,
        'x-user-api-key': 'uak_test',
        'x-org-api-key': null,
      });
      expect(credentialHeaders(sentHeaders(fetchMock, 1))).toEqual({
        'x-api-key': null,
        'x-user-api-key': 'uak_test',
        'x-org-api-key': null,
      });
    });

    it('authenticates every request with the organization key when it is the only key', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({ ...baseConfig, apiKey: null, orgApiKey: 'oak_test' });

      expect(composio.getClient().authMode).toBe('organization');
      await composio.getClient().org.owner.project.list();

      expect(credentialHeaders(sentHeaders(fetchMock))).toEqual({
        'x-api-key': null,
        'x-user-api-key': null,
        'x-org-api-key': 'oak_test',
      });
    });

    it('rejects a disabled project key when neither alternate key is configured', () => {
      vi.stubEnv('COMPOSIO_API_KEY', 'ak_env');
      expect(() => new Composio({ ...baseConfig, apiKey: null })).toThrow(ComposioNoAPIKeyError);
    });
  });

  describe('credential default headers', () => {
    it('authenticates with an x-user-api-key header alone and does not forward it as a header', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({
        ...baseConfig,
        apiKey: null,
        defaultHeaders: { 'X-User-Api-Key': 'uak_header', 'x-request-id': 'req-1' },
      });

      expect(composio.getClient().authMode).toBe('user');
      expect(composio.getConfig()).toMatchObject({
        apiKey: null,
        userApiKey: 'uak_header',
        defaultHeaders: { 'x-request-id': 'req-1' },
      });
      await composio.getClient().toolRouter.session.retrieve('trs_1');

      const headers = sentHeaders(fetchMock);
      expect(credentialHeaders(headers)).toEqual({
        'x-api-key': null,
        'x-user-api-key': 'uak_header',
        'x-org-api-key': null,
      });
      expect(headers.get('x-request-id')).toBe('req-1');
    });

    it('lets an x-user-api-key header replace a configured project key', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({
        ...baseConfig,
        defaultHeaders: { 'x-user-api-key': 'uak_header' },
      });

      expect(composio.getClient().authMode).toBe('user');
      await composio.getClient().toolkits.retrieve('github');

      expect(credentialHeaders(sentHeaders(fetchMock))).toEqual({
        'x-api-key': null,
        'x-user-api-key': 'uak_header',
        'x-org-api-key': null,
      });
    });

    it('lets an x-org-api-key header replace the configured keys', () => {
      const composio = new Composio({
        ...baseConfig,
        userApiKey: 'uak_test',
        defaultHeaders: { 'x-org-api-key': 'oak_header' },
      });

      expect(composio.getClient().authMode).toBe('organization');
      expect(composio.getConfig()).toMatchObject({
        apiKey: null,
        userApiKey: null,
        orgApiKey: 'oak_header',
      });
    });

    it('authenticates with an x-org-api-key header alone when the project key is disabled', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({
        ...baseConfig,
        apiKey: null,
        defaultHeaders: { 'x-org-api-key': 'oak_header' },
      });

      expect(composio.getClient().authMode).toBe('organization');
      await composio.getClient().toolkits.retrieve('github');

      expect(credentialHeaders(sentHeaders(fetchMock))).toEqual({
        'x-api-key': null,
        'x-user-api-key': null,
        'x-org-api-key': 'oak_header',
      });
    });

    it('takes the project key from an x-api-key header', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({
        ...baseConfig,
        defaultHeaders: { 'x-api-key': 'ak_header' },
      });

      expect(composio.getClient().authMode).toBe('project');
      await composio.getClient().toolkits.retrieve('github');

      expect(sentHeaders(fetchMock).get('x-api-key')).toBe('ak_header');
    });

    it('rejects more than one credential header', () => {
      expect(
        () =>
          new Composio({
            ...baseConfig,
            defaultHeaders: { 'x-api-key': 'ak_header', 'x-user-api-key': 'uak_header' },
          })
      ).toThrow(ComposioError);
    });

    it('rejects a raw x-api-key default header when the project key is disabled', () => {
      expect(
        () =>
          new Composio({
            ...baseConfig,
            apiKey: null,
            userApiKey: 'uak_test',
            defaultHeaders: { 'x-api-key': 'ak_raw' },
          })
      ).toThrow(ComposioNoAPIKeyError);
    });

    it('still lets the API client reject identity headers', () => {
      expect(
        () => new Composio({ ...baseConfig, defaultHeaders: { 'x-source': 'custom' } })
      ).toThrow(ClientComposioError);
    });
  });

  describe('createSession()', () => {
    it('carries the resolved keys on the config, not the API client, into clones', () => {
      vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_env');
      vi.stubEnv('COMPOSIO_ORG_API_KEY', 'oak_env');
      const composio = new Composio(baseConfig);
      expect(composio.getConfig()).toMatchObject({ userApiKey: 'uak_env', orgApiKey: 'oak_env' });

      vi.stubEnv('COMPOSIO_USER_API_KEY', '');
      vi.stubEnv('COMPOSIO_ORG_API_KEY', 'oak_other');
      const session = composio.createSession({ headers: { 'x-request-id': '1' } });

      expect(session.getConfig()).toMatchObject({
        apiKey: 'ak_test',
        userApiKey: 'uak_env',
        orgApiKey: 'oak_env',
      });
      expect(session.getClient().authMode).toBe('auto');
    });

    it('routes a user key from the parent default headers through auth', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({
        ...baseConfig,
        defaultHeaders: { 'x-user-api-key': 'uak_header' },
      });

      const session = composio.createSession({ headers: { 'x-request-id': 'req-2' } });
      await session.getClient().toolRouter.session.retrieve('trs_1');

      expect(session.getConfig().defaultHeaders).toEqual({ 'x-request-id': 'req-2' });
      expect(session.getClient().authMode).toBe('user');
      expect(credentialHeaders(sentHeaders(fetchMock))).toEqual({
        'x-api-key': null,
        'x-user-api-key': 'uak_header',
        'x-org-api-key': null,
      });
    });

    it('lets a clone header replace the parent user key', () => {
      const composio = new Composio({ ...baseConfig, apiKey: null, userApiKey: 'uak_parent' });

      const session = composio.createSession({ headers: { 'x-user-api-key': 'uak_clone' } });

      expect(session.getConfig()).toMatchObject({ apiKey: null, userApiKey: 'uak_clone' });
      expect(session.getClient().authMode).toBe('user');
    });
  });

  describe('scope', () => {
    const orgId = 'org_nano_abc';
    const projectId = 'proj_nano_xyz';

    it('passes orgId and projectId to the API client as its scope', async () => {
      const fetchMock = captureFetch();
      const composio = new Composio({ ...baseConfig, orgId, projectId });

      expect(composio.getClient().scope).toEqual({ organizationId: orgId, projectId });
      await composio.getClient().toolkits.retrieve('github');

      const headers = sentHeaders(fetchMock);
      expect(headers.get('x-org-id')).toBe(orgId);
      expect(headers.get('x-project-id')).toBe(projectId);
    });

    it('moves a scope supplied through default headers into the client scope', () => {
      const composio = new Composio({
        ...baseConfig,
        defaultHeaders: { 'X-Org-Id': orgId, 'x-project-id': projectId, 'x-request-id': 'r' },
      });

      expect(composio.getClient().scope).toEqual({ organizationId: orgId, projectId });
      expect(composio.getConfig()).toMatchObject({
        orgId,
        projectId,
        defaultHeaders: { 'x-request-id': 'r' },
      });
    });

    it('leaves the client unscoped without a scope', () => {
      expect(new Composio(baseConfig).getClient().scope).toBeUndefined();
    });

    it('keeps the scope on clones', () => {
      const session = new Composio({ ...baseConfig, orgId, projectId }).createSession();

      expect(session.getClient().scope).toEqual({ organizationId: orgId, projectId });
    });

    it('rejects a scope option that disagrees with its default header', () => {
      expect(
        () =>
          new Composio({
            ...baseConfig,
            orgId,
            projectId,
            defaultHeaders: { 'x-org-id': 'org_other' },
          })
      ).toThrow(ComposioScopeConfigError);
    });
  });
});
