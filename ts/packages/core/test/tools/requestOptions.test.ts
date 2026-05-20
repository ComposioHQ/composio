import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks, toolkitMocks } from '../utils/mocks/data.mock';
import { Tools } from '../../src/models/Tools';
import { Toolkits } from '../../src/models/Toolkits';
import { AuthConfigs } from '../../src/models/AuthConfigs';
import { ConnectedAccounts } from '../../src/models/ConnectedAccounts';
import ComposioClient from '@composio/client';
import { MockProvider } from '../utils/mocks/provider.mock';

/**
 * Verifies that ComposioRequestOptions (`signal`, `timeout`) is forwarded as
 * the final positional argument to the underlying `@composio/client` call.
 *
 * Two-mode behaviour is intentional:
 *   - When NO requestOptions is supplied, the SDK calls the client WITHOUT a
 *     trailing argument (so existing wire/test assertions stay stable).
 *   - When requestOptions IS supplied, it's forwarded verbatim — letting the
 *     caller cancel an in-flight request via AbortController or impose a
 *     tighter per-call timeout.
 */
describe('Tools — requestOptions (signal/timeout) forwarding', () => {
  let tools: Tools<unknown, unknown, MockProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Tools(mockClient as unknown as ComposioClient, { provider: new MockProvider() });
  });

  describe('getRawComposioTools', () => {
    it('forwards signal + timeout to client.tools.list', async () => {
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal, timeout: 5_000 };
      mockClient.tools.list.mockResolvedValueOnce({ items: [], totalPages: 1 });

      await tools.getRawComposioTools({ search: 'send email' }, undefined, requestOptions);

      expect(mockClient.tools.list).toHaveBeenCalledWith(expect.any(Object), requestOptions);
    });

    it('omits the requestOptions argument when not provided', async () => {
      mockClient.tools.list.mockResolvedValueOnce({ items: [], totalPages: 1 });

      await tools.getRawComposioTools({ search: 'send email' });

      // No trailing arg → exactly one positional argument to client.tools.list
      const calls = mockClient.tools.list.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveLength(1);
    });

    it('propagates an AbortError when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      mockClient.tools.list.mockImplementationOnce(async (_q, opts) => {
        // Mirror @composio/client behaviour: throw if signal is aborted.
        if (opts?.signal?.aborted) {
          const err = new Error('Request was aborted');
          err.name = 'APIUserAbortError';
          throw err;
        }
        return { items: [], totalPages: 1 };
      });

      await expect(
        tools.getRawComposioTools({ search: 'send email' }, undefined, {
          signal: controller.signal,
        })
      ).rejects.toMatchObject({ name: 'APIUserAbortError' });
    });
  });

  describe('execute', () => {
    it('forwards signal + timeout to client.tools.execute', async () => {
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal, timeout: 100_000 };

      // Mock the schema lookup path inside execute.
      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);
      const getRawComposioToolBySlugSpy = vi.spyOn(tools, 'getRawComposioToolBySlug');
      getRawComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as never);
      mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

      await tools.execute(
        'COMPOSIO_TOOL',
        { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
        undefined,
        requestOptions
      );

      expect(mockClient.tools.execute).toHaveBeenCalledWith(
        'COMPOSIO_TOOL',
        expect.any(Object),
        requestOptions
      );
      // Schema lookup also receives the same requestOptions so the WHOLE call
      // is cancellable, not just the final POST.
      expect(getRawComposioToolBySlugSpy).toHaveBeenCalledWith(
        'COMPOSIO_TOOL',
        expect.any(Object),
        requestOptions
      );
    });
  });

  describe('proxyExecute', () => {
    it('forwards signal + timeout to client.tools.proxy', async () => {
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal };
      mockClient.tools.proxy.mockResolvedValueOnce({ data: {} });

      await tools.proxyExecute(
        { endpoint: '/v1/anything', method: 'GET', connectedAccountId: 'ca_1' },
        requestOptions
      );

      expect(mockClient.tools.proxy).toHaveBeenCalledWith(expect.any(Object), requestOptions);
    });
  });

  describe('getToolsEnum / getInput', () => {
    it('forwards requestOptions on retrieveEnum', async () => {
      const requestOptions = { timeout: 1_000 };
      mockClient.tools.retrieveEnum.mockResolvedValueOnce({ items: [] });

      await tools.getToolsEnum(requestOptions);

      expect(mockClient.tools.retrieveEnum).toHaveBeenCalledWith(requestOptions);
    });

    it('forwards requestOptions on getInput', async () => {
      const requestOptions = { timeout: 1_000 };
      mockClient.tools.getInput.mockResolvedValueOnce({ data: {} });

      await tools.getInput('GITHUB_GET_REPOS', { userId: 'user_1' }, requestOptions);

      expect(mockClient.tools.getInput).toHaveBeenCalledWith(
        'GITHUB_GET_REPOS',
        expect.any(Object),
        requestOptions
      );
    });

    it('calls retrieveEnum without arguments when no requestOptions', async () => {
      mockClient.tools.retrieveEnum.mockResolvedValueOnce({ items: [] });

      await tools.getToolsEnum();

      const calls = mockClient.tools.retrieveEnum.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveLength(0);
    });
  });
});

describe('Other models — requestOptions (signal/timeout) forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards requestOptions on toolkits.get(slug)', async () => {
    const toolkits = new Toolkits(mockClient as unknown as ComposioClient);
    const requestOptions = { signal: new AbortController().signal };
    mockClient.toolkits.retrieve.mockResolvedValueOnce(toolkitMocks.rawToolkit);

    await toolkits.get('github', requestOptions);

    expect(mockClient.toolkits.retrieve).toHaveBeenCalledWith('github', undefined, requestOptions);
  });

  it('forwards requestOptions on toolkits.get(query)', async () => {
    const toolkits = new Toolkits(mockClient as unknown as ComposioClient);
    const requestOptions = { timeout: 5_000 };
    mockClient.toolkits.list.mockResolvedValueOnce({ items: [], totalPages: 1 });

    await toolkits.get({}, requestOptions);

    expect(mockClient.toolkits.list).toHaveBeenCalledWith(expect.any(Object), requestOptions);
  });

  it('forwards requestOptions on authConfigs.list', async () => {
    const authConfigs = new AuthConfigs(mockClient as unknown as ComposioClient);
    const requestOptions = { timeout: 5_000 };
    mockClient.authConfigs.list.mockResolvedValueOnce({ items: [], totalPages: 1 });

    await authConfigs.list(undefined, requestOptions);

    expect(mockClient.authConfigs.list).toHaveBeenCalledWith(expect.any(Object), requestOptions);
  });

  it('forwards requestOptions on connectedAccounts.list', async () => {
    const connectedAccounts = new ConnectedAccounts(mockClient as unknown as ComposioClient);
    const requestOptions = { signal: new AbortController().signal };
    mockClient.connectedAccounts.list.mockResolvedValueOnce({ items: [], totalPages: 1 });

    await connectedAccounts.list({ userIds: ['user_1'] }, requestOptions);

    expect(mockClient.connectedAccounts.list).toHaveBeenCalledWith(
      expect.any(Object),
      requestOptions
    );
  });

  it('omits the requestOptions arg on connectedAccounts.list when undefined', async () => {
    const connectedAccounts = new ConnectedAccounts(mockClient as unknown as ComposioClient);
    mockClient.connectedAccounts.list.mockResolvedValueOnce({ items: [], totalPages: 1 });

    await connectedAccounts.list({ userIds: ['user_1'] });

    const calls = mockClient.connectedAccounts.list.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
  });
});
