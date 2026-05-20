import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks, toolkitMocks } from '../utils/mocks/data.mock';
import { Tools } from '../../src/models/Tools';
import { Toolkits } from '../../src/models/Toolkits';
import { AuthConfigs } from '../../src/models/AuthConfigs';
import { ConnectedAccounts } from '../../src/models/ConnectedAccounts';
import ComposioClient, { APIUserAbortError } from '@composio/client';
import { MockProvider } from '../utils/mocks/provider.mock';
import { ComposioRequestCancelledError } from '../../src/errors/SDKErrors';
import { ComposioToolExecutionError } from '../../src/errors/ToolErrors';

/**
 * Verifies that ComposioRequestOptions (`signal`) is forwarded as the final
 * positional argument to the underlying `@composio/client` call, and that
 * aborts are translated into a typed {@link ComposioRequestCancelledError}.
 *
 * Two-mode behaviour is intentional:
 *   - When NO requestOptions is supplied, the SDK calls the client WITHOUT a
 *     trailing argument (so existing wire/test assertions stay stable).
 *   - When requestOptions IS supplied, it's forwarded verbatim — letting the
 *     caller cancel an in-flight request via AbortController.
 */
describe('Tools — requestOptions (signal) forwarding', () => {
  let tools: Tools<unknown, unknown, MockProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Tools(mockClient as unknown as ComposioClient, { provider: new MockProvider() });
  });

  describe('getRawComposioTools', () => {
    it('forwards signal to client.tools.list', async () => {
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal };
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

    it('translates a real @composio/client APIUserAbortError into ComposioRequestCancelledError', async () => {
      // Use the REAL APIUserAbortError class — not a stub — so we catch the
      // case Codex flagged: the class inherits `name === "Error"` because it
      // never sets `this.name`. A name-only detector misses this; instanceof
      // is the canonical path.
      const realAbort = new APIUserAbortError();
      // Sanity-check the contract we're testing.
      expect(realAbort.name).toBe('Error');
      expect(realAbort.constructor.name).toBe('APIUserAbortError');

      mockClient.tools.list.mockImplementationOnce(async () => {
        throw realAbort;
      });

      await expect(
        tools.getRawComposioTools({ search: 'send email' }, undefined, {
          signal: new AbortController().signal,
        })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    });

    it('translates a generic AbortError into ComposioRequestCancelledError', async () => {
      // Some transports surface a generic AbortError (DOM-style). Confirm
      // the name fallback still works.
      mockClient.tools.list.mockImplementationOnce(async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      });

      await expect(
        tools.getRawComposioTools({ search: 'send email' }, undefined, {
          signal: new AbortController().signal,
        })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    });

    it('translates an abort wrapped in error.cause into ComposioRequestCancelledError', async () => {
      // Defensive against future @composio/client refactors that might
      // wrap APIUserAbortError in an outer APIError (e.g. retry-context
      // wrapping). The detector must walk `error.cause` so it still fires.
      mockClient.tools.list.mockImplementationOnce(async () => {
        const inner = new APIUserAbortError();
        const outer = new Error('Request failed during retry', { cause: inner });
        outer.name = 'APIError';
        throw outer;
      });

      await expect(
        tools.getRawComposioTools({ search: 'send email' }, undefined, {
          signal: new AbortController().signal,
        })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    });
  });

  describe('execute', () => {
    it('forwards signal to client.tools.execute', async () => {
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal };

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

    it('aborts during execute surface as ComposioRequestCancelledError, not ComposioToolExecutionError', async () => {
      const controller = new AbortController();
      mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);
      const getRawComposioToolBySlugSpy = vi.spyOn(tools, 'getRawComposioToolBySlug');
      getRawComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as never);
      mockClient.tools.execute.mockImplementationOnce(async () => {
        const err = new Error('Request was aborted');
        err.name = 'APIUserAbortError';
        throw err;
      });

      try {
        await tools.execute(
          'COMPOSIO_TOOL',
          { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
          undefined,
          { signal: controller.signal }
        );
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ComposioRequestCancelledError);
        expect(err).not.toBeInstanceOf(ComposioToolExecutionError);
      }
    });

    it('aborts during schema retrieval surface as ComposioRequestCancelledError, not ComposioToolNotFoundError', async () => {
      // Reset because earlier tests in this describe block queue mocks on
      // mockClient.tools.retrieve via mockResolvedValueOnce; without a reset,
      // the throwing mock would be queued behind a stale resolve.
      mockClient.tools.retrieve.mockReset();
      const controller = new AbortController();
      mockClient.tools.retrieve.mockImplementationOnce(async () => {
        const err = new Error('Request was aborted');
        err.name = 'APIUserAbortError';
        throw err;
      });
      vi.spyOn(tools['customTools'], 'getCustomToolBySlug').mockResolvedValueOnce(undefined);

      await expect(
        tools.getRawComposioToolBySlug('GITHUB_GET_REPOS', undefined, {
          signal: controller.signal,
        })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    });

    it('forwards requestOptions through the custom-tool branch (proxy + lookups cancellable)', async () => {
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal };

      // Register a custom tool with a toolkitSlug so executeCustomTool walks
      // through getConnectedAccountForToolkit + the inner executeToolRequest
      // closure (which calls client.tools.proxy).
      // We bypass createTool's validation by directly stubbing
      // getCustomToolBySlug + executeCustomTool spy verification.
      const customToolStub = {
        slug: 'CUSTOM_TOOL',
        name: 'Custom Tool',
        description: 'test',
        inputParameters: { type: 'object', properties: {} },
        outputParameters: undefined,
        availableVersions: undefined,
        isDeprecated: false,
        isNoAuth: undefined,
        toolkit: { slug: 'github', name: 'GitHub', logo: 'x' },
      };
      vi.spyOn(tools['customTools'], 'getCustomToolBySlug').mockResolvedValue(
        customToolStub as never
      );
      const executeCustomToolSpy = vi
        .spyOn(tools['customTools'], 'executeCustomTool')
        .mockResolvedValueOnce({ data: {}, error: null, successful: true });

      await tools.execute(
        'CUSTOM_TOOL',
        { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
        undefined,
        requestOptions
      );

      // The custom-tool branch must receive the same requestOptions so its
      // pre-flight HTTP and in-tool proxy calls can be cancelled.
      expect(executeCustomToolSpy).toHaveBeenCalledWith(
        'CUSTOM_TOOL',
        expect.any(Object),
        requestOptions
      );
    });

    it('ComposioRequestCancelledError carries a non-empty message', async () => {
      mockClient.tools.list.mockReset();
      mockClient.tools.list.mockImplementationOnce(async () => {
        const err = new Error('The operation was aborted');
        err.name = 'APIUserAbortError';
        throw err;
      });

      try {
        await tools.getRawComposioTools({ search: 'send email' }, undefined, {
          signal: new AbortController().signal,
        });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ComposioRequestCancelledError);
        // Message must be non-empty so logs/UIs don't render a blank error.
        expect((err as Error).message).not.toEqual('');
        expect((err as Error).message).toMatch(/cancelled/i);
      }
    });
  });

  describe('proxyExecute', () => {
    it('forwards signal to client.tools.proxy', async () => {
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
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal };
      mockClient.tools.retrieveEnum.mockResolvedValueOnce({ items: [] });

      await tools.getToolsEnum(requestOptions);

      expect(mockClient.tools.retrieveEnum).toHaveBeenCalledWith(requestOptions);
    });

    it('forwards requestOptions on getInput', async () => {
      const controller = new AbortController();
      const requestOptions = { signal: controller.signal };
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

describe('Other models — requestOptions (signal) forwarding', () => {
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
    const requestOptions = { signal: new AbortController().signal };
    mockClient.toolkits.list.mockResolvedValueOnce({ items: [], totalPages: 1 });

    await toolkits.get({}, requestOptions);

    expect(mockClient.toolkits.list).toHaveBeenCalledWith(expect.any(Object), requestOptions);
  });

  it('forwards requestOptions on authConfigs.list', async () => {
    const authConfigs = new AuthConfigs(mockClient as unknown as ComposioClient);
    const requestOptions = { signal: new AbortController().signal };
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
