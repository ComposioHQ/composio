import { describe, it, expect, vi } from 'vitest';
import ComposioClient, { Auth, createFetchTransport } from '@composio/client';
import { MCP } from '../../src/models/MCP';
import logger from '../../src/utils/logger';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: { instrument: vi.fn() },
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

describe('MCP.generate managed auth deprecation', () => {
  it('replaces the API client notice with one SDK notice per process', async () => {
    const clientLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const client = new ComposioClient({
      auth: Auth.project('test-api-key'),
      baseURL: 'https://backend.composio.test',
      logger: clientLogger,
      logLevel: 'warn',
      transport: createFetchTransport({
        fetch: async input =>
          String(input).includes('/generate')
            ? json({ mcp_url: 'https://mcp.test', connected_account_urls: [], user_ids_url: ['u'] })
            : json({ id: 'mcp_123', name: 'server', allowed_tools: [], auth_config_ids: [] }),
      }),
    });
    const sdkWarn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const mcp = new MCP(client);

    await mcp.generate('user123', 'mcp_123');
    await mcp.generate('user123', 'mcp_123');
    await mcp.generate('user123', 'mcp_123', { manuallyManageConnections: true });

    expect(clientLogger.warn).not.toHaveBeenCalled();
    expect(sdkWarn).toHaveBeenCalledTimes(1);
    expect(sdkWarn.mock.calls[0][0]).toContain('include_composio_helper_actions');
  });
});
