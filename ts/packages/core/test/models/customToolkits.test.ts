import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComposioClient from '@composio/client';
import { CustomToolkits } from '../../src/models/CustomToolkits';
import { Experimental } from '../../src/models/Experimental';
import { telemetry } from '../../src/telemetry/Telemetry';
import { ValidationError } from '../../src/errors/ValidationErrors';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

const createMockClient = () => ({
  custom: {
    createToolkit: vi.fn(),
    updateToolkits: vi.fn(),
    upsert: vi.fn(),
    sync: vi.fn(),
    deleteToolkit: vi.fn(),
  },
});

describe('Experimental.customToolkits', () => {
  let customToolkits: CustomToolkits;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    customToolkits = new Experimental(mockClient as unknown as ComposioClient).customToolkits;
  });

  it('mounts on the experimental namespace and instruments it', () => {
    expect(customToolkits).toBeInstanceOf(CustomToolkits);
    expect(telemetry.instrument).toHaveBeenCalledWith(customToolkits, 'CustomToolkits');
  });

  describe('create', () => {
    it('maps the toolkit to the wire and transforms the connect link', async () => {
      mockClient.custom.createToolkit.mockResolvedValue({
        slug: 'CUSTOM_MY_TOOLKIT_K7F2Q',
        connect_link: {
          redirect_url: 'https://connect.composio.dev/link/lk_1',
          expires_at: '2026-11-03T12:00:00Z',
          connected_account_id: 'ca_abc123',
        },
      });
      const signal = new AbortController().signal;

      const result = await customToolkits.create(
        {
          name: 'My Toolkit',
          mcpUrl: 'https://mcp.example.com/mcp',
          logoFile: { content: 'aGVsbG8=', mimeType: 'image/png' },
          authSchemes: [
            {
              mode: 'API_KEY',
              headers: {
                Authorization: 'Bearer {{generic_api_key}}',
                'X-Org-Id': '{{generic_id}}',
              },
              apiKeyField: { displayName: 'API key' },
              additionalFields: {
                genericId: {
                  displayName: 'Organization ID',
                  description: 'From your settings page',
                },
              },
            },
          ],
          userId: 'user_123',
          callbackUrl: 'https://app.example.com/connected',
        },
        { signal }
      );

      const [body, options] = mockClient.custom.createToolkit.mock.calls[0];
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        name: 'My Toolkit',
        mcp_url: 'https://mcp.example.com/mcp',
        logo_file: { content: 'aGVsbG8=', mime_type: 'image/png' },
        auth_schemes: [
          {
            mode: 'API_KEY',
            headers: {
              Authorization: 'Bearer {{generic_api_key}}',
              'X-Org-Id': '{{generic_id}}',
            },
            api_key_field: { display_name: 'API key' },
            additional_fields: {
              generic_id: {
                display_name: 'Organization ID',
                description: 'From your settings page',
              },
            },
          },
        ],
        user_id: 'user_123',
        callback_url: 'https://app.example.com/connected',
      });
      expect(options).toEqual({ signal });
      expect(result).toEqual({
        slug: 'CUSTOM_MY_TOOLKIT_K7F2Q',
        connectLink: {
          redirectUrl: 'https://connect.composio.dev/link/lk_1',
          expiresAt: '2026-11-03T12:00:00Z',
          connectedAccountId: 'ca_abc123',
        },
      });
    });

    it('returns a null connect link for a shared toolkit', async () => {
      mockClient.custom.createToolkit.mockResolvedValue({
        slug: 'CUSTOM_MY_TOOLKIT_K7F2Q',
        connect_link: null,
      });

      const result = await customToolkits.create({
        name: 'My Toolkit',
        mcpUrl: 'https://mcp.example.com/mcp',
        authSchemes: [{ mode: 'NO_AUTH' }],
        userId: 'all',
      });

      expect(result).toEqual({ slug: 'CUSTOM_MY_TOOLKIT_K7F2Q', connectLink: null });
    });

    it.each([
      ['no user ID', { userId: undefined }],
      ['no auth schemes', { authSchemes: [] }],
      ['an MCP URL that is not a URL', { mcpUrl: 'not a url' }],
      [
        'an additional API key field without a display name',
        {
          authSchemes: [
            {
              mode: 'API_KEY',
              headers: { 'X-Org-Id': '{{generic_id}}' },
              additionalFields: { genericId: { description: 'From your settings page' } },
            },
          ],
        },
      ],
    ])('rejects %s before calling the API', async (_label, override) => {
      await expect(
        customToolkits.create({
          name: 'My Toolkit',
          mcpUrl: 'https://mcp.example.com/mcp',
          authSchemes: [{ mode: 'NO_AUTH' }],
          userId: 'all',
          ...(override as object),
        })
      ).rejects.toThrow(ValidationError);
      expect(mockClient.custom.createToolkit).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('sends only the given fields and transforms the response', async () => {
      mockClient.custom.updateToolkits.mockResolvedValue({ success: true });

      const result = await customToolkits.update('CUSTOM_MY_TOOLKIT_K7F2Q', {
        apiKeyField: { displayName: 'Token', description: 'From your settings page' },
        userId: 'user_123',
      });

      const [slug, body] = mockClient.custom.updateToolkits.mock.calls[0];
      expect(slug).toBe('CUSTOM_MY_TOOLKIT_K7F2Q');
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        api_key_field: { display_name: 'Token', description: 'From your settings page' },
        user_id: 'user_123',
      });
      expect(result).toEqual({ success: true });
    });

    it('rejects an update with nothing to change before calling the API', async () => {
      await expect(
        customToolkits.update('CUSTOM_MY_TOOLKIT_K7F2Q', { userId: 'user_123' })
      ).rejects.toThrow(ValidationError);
      expect(mockClient.custom.updateToolkits).not.toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    it('warns once per process that it is deprecated', async () => {
      vi.resetModules();
      const { CustomToolkits: FreshCustomToolkits } =
        await import('../../src/models/CustomToolkits');
      const { default: freshLogger } = await import('../../src/utils/logger');
      const warn = vi.spyOn(freshLogger, 'warn').mockImplementation(() => {});
      mockClient.custom.upsert.mockResolvedValue({ slug: 'CUSTOM_MY_TOOLKIT' });
      const fresh = new FreshCustomToolkits(mockClient as unknown as ComposioClient);
      const params = {
        slug: 'MY_TOOLKIT',
        toolkitConfig: {
          name: 'My Toolkit',
          mcpUrl: 'https://mcp.example.com/mcp',
          authSchemes: [{ mode: 'NO_AUTH' as const }],
        },
      };

      await fresh.upsert(params);
      await fresh.upsert(params);

      const deprecationWarnings = warn.mock.calls.filter(([message]) =>
        String(message).includes('upsert() is deprecated')
      );
      expect(deprecationWarnings).toHaveLength(1);
    });

    it('maps every auth scheme and the logo to the wire', async () => {
      mockClient.custom.upsert.mockResolvedValue({ slug: 'CUSTOM_MY_TOOLKIT' });

      const result = await customToolkits.upsert({
        slug: 'MY TOOLKIT',
        toolkitConfig: {
          name: 'My Toolkit',
          mcpUrl: 'https://mcp.example.com/mcp',
          logoFile: { content: 'aGVsbG8=', mimeType: 'image/png' },
          authSchemes: [
            { mode: 'NO_AUTH' },
            {
              mode: 'API_KEY',
              headers: { Authorization: 'Bearer {{generic_api_key}}' },
              apiKeyField: { displayName: 'API key', description: 'From your settings page' },
            },
            {
              mode: 'DCR_OAUTH',
              discoveryUrl: 'https://mcp.example.com/.well-known/oauth-authorization-server',
            },
          ],
        },
      });

      expect(mockClient.custom.upsert).toHaveBeenCalledWith(
        {
          slug: 'MY TOOLKIT',
          toolkit_config: {
            name: 'My Toolkit',
            mcp_url: 'https://mcp.example.com/mcp',
            logo_file: { content: 'aGVsbG8=', mime_type: 'image/png' },
            auth_schemes: [
              { mode: 'NO_AUTH' },
              {
                mode: 'API_KEY',
                headers: { Authorization: 'Bearer {{generic_api_key}}' },
                api_key_field: { display_name: 'API key', description: 'From your settings page' },
              },
              {
                mode: 'DCR_OAUTH',
                discovery_url: 'https://mcp.example.com/.well-known/oauth-authorization-server',
              },
            ],
          },
        },
        undefined
      );
      expect(result).toEqual({ slug: 'CUSTOM_MY_TOOLKIT' });
    });

    it('omits the optional logo and API key copy', async () => {
      mockClient.custom.upsert.mockResolvedValue({ slug: 'CUSTOM_MY_TOOLKIT' });

      await customToolkits.upsert({
        slug: 'MY_TOOLKIT',
        toolkitConfig: {
          name: 'My Toolkit',
          mcpUrl: 'https://mcp.example.com/mcp',
          authSchemes: [{ mode: 'API_KEY', headers: { 'x-api-key': '{{generic_api_key}}' } }],
        },
      });

      const [body] = mockClient.custom.upsert.mock.calls[0];
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        slug: 'MY_TOOLKIT',
        toolkit_config: {
          name: 'My Toolkit',
          mcp_url: 'https://mcp.example.com/mcp',
          auth_schemes: [{ mode: 'API_KEY', headers: { 'x-api-key': '{{generic_api_key}}' } }],
        },
      });
    });

    it.each([
      ['a slug outside the API grammar', { slug: 'my-toolkit' }],
      ['no auth schemes', { authSchemes: [] }],
      ['an MCP URL that is not a URL', { mcpUrl: 'not a url' }],
    ])('rejects %s before calling the API', async (_label, override) => {
      const { slug = 'MY_TOOLKIT', ...config } = override as Record<string, unknown>;

      await expect(
        customToolkits.upsert({
          slug: slug as string,
          toolkitConfig: {
            name: 'My Toolkit',
            mcpUrl: 'https://mcp.example.com/mcp',
            authSchemes: [{ mode: 'NO_AUTH' }],
            ...config,
          },
        })
      ).rejects.toThrow(ValidationError);
      expect(mockClient.custom.upsert).not.toHaveBeenCalled();
    });
  });

  describe('sync', () => {
    it('sends the slug and connected account and transforms the response', async () => {
      mockClient.custom.sync.mockResolvedValue({
        slug: 'CUSTOM_MY_TOOLKIT',
        version: '20260911_00',
        synced_count: 12,
      });
      const signal = new AbortController().signal;

      const result = await customToolkits.sync(
        'CUSTOM_MY_TOOLKIT',
        { connectedAccountId: 'ca_abc123' },
        { signal }
      );

      expect(mockClient.custom.sync).toHaveBeenCalledWith(
        { slug: 'CUSTOM_MY_TOOLKIT', connected_account_id: 'ca_abc123' },
        { signal }
      );
      expect(result).toEqual({
        slug: 'CUSTOM_MY_TOOLKIT',
        version: '20260911_00',
        syncedCount: 12,
      });
    });

    it('sends only the slug when called without params', async () => {
      mockClient.custom.sync.mockResolvedValue({
        slug: 'CUSTOM_MY_TOOLKIT',
        version: '20260911_00',
        synced_count: 0,
      });

      await customToolkits.sync('CUSTOM_MY_TOOLKIT');

      expect(mockClient.custom.sync).toHaveBeenCalledWith(
        { slug: 'CUSTOM_MY_TOOLKIT', connected_account_id: undefined },
        undefined
      );
    });
  });

  describe('delete', () => {
    it('deletes the toolkit and transforms the response', async () => {
      mockClient.custom.deleteToolkit.mockResolvedValue({
        slug: 'CUSTOM_MY_TOOLKIT',
        deleted: true,
        revoke_job_ids: ['job_1'],
        auth_configs_deleted: 1,
        connected_accounts_deleted: 2,
      });

      const result = await customToolkits.delete('CUSTOM_MY_TOOLKIT');

      expect(mockClient.custom.deleteToolkit).toHaveBeenCalledWith(
        'CUSTOM_MY_TOOLKIT',
        {},
        undefined
      );
      expect(result).toEqual({
        slug: 'CUSTOM_MY_TOOLKIT',
        deleted: true,
        revokeJobIds: ['job_1'],
        authConfigsDeleted: 1,
        connectedAccountsDeleted: 2,
      });
    });
  });
});
