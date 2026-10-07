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

  describe('upsert', () => {
    it('maps every auth scheme and the logo to the wire', async () => {
      mockClient.custom.upsert.mockResolvedValue({ slug: 'CUSTOM_MY_TOOLKIT' });

      const result = await customToolkits.upsert({
        slug: 'MY TOOLKIT',
        toolkitConfig: {
          name: 'My Toolkit',
          appUrl: 'https://mcp.example.com/mcp',
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
            app_url: 'https://mcp.example.com/mcp',
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
          appUrl: 'https://mcp.example.com/mcp',
          authSchemes: [{ mode: 'API_KEY', headers: { 'x-api-key': '{{generic_api_key}}' } }],
        },
      });

      const [body] = mockClient.custom.upsert.mock.calls[0];
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        slug: 'MY_TOOLKIT',
        toolkit_config: {
          name: 'My Toolkit',
          app_url: 'https://mcp.example.com/mcp',
          auth_schemes: [{ mode: 'API_KEY', headers: { 'x-api-key': '{{generic_api_key}}' } }],
        },
      });
    });

    it.each([
      ['a slug outside the API grammar', { slug: 'my-toolkit' }],
      ['no auth schemes', { authSchemes: [] }],
      ['an app URL that is not a URL', { appUrl: 'not a url' }],
    ])('rejects %s before calling the API', async (_label, override) => {
      const { slug = 'MY_TOOLKIT', ...config } = override as Record<string, unknown>;

      await expect(
        customToolkits.upsert({
          slug: slug as string,
          toolkitConfig: {
            name: 'My Toolkit',
            appUrl: 'https://mcp.example.com/mcp',
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

      expect(mockClient.custom.deleteToolkit).toHaveBeenCalledWith('CUSTOM_MY_TOOLKIT', undefined);
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
