import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from '../utils/mocks/client.mock';
import { toolMocks } from '../utils/mocks/data.mock';
import { Tools } from '../../src/models/Tools';
import ComposioClient, { APIUserAbortError } from '@composio/client';
import { MockProvider } from '../utils/mocks/provider.mock';
import { ComposioRequestCancelledError } from '../../src/errors/SDKErrors';
import type { SessionContext } from '../../src/types/customTool.types';
import { ComposioToolExecutionError } from '../../src/errors/ToolErrors';

describe('Cancellation — error normalization', () => {
  let tools: Tools<unknown, unknown, MockProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Tools(mockClient as unknown as ComposioClient, { provider: new MockProvider() });
  });

  it('translates a real APIUserAbortError (which inherits name==="Error") into ComposioRequestCancelledError', async () => {
    const realAbort = new APIUserAbortError();
    expect(realAbort.name).toBe('Error');

    mockClient.tools.list.mockImplementationOnce(async () => {
      throw realAbort;
    });

    await expect(
      tools.getRawComposioTools({ search: 'send email' }, undefined, {
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
  });

  it('translates a generic AbortError into ComposioRequestCancelledError', async () => {
    mockClient.tools.list.mockImplementationOnce(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    await expect(
      tools.getRawComposioTools({ search: 'send email' }, undefined, {
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
  });

  it('walks error.cause to detect a wrapped abort', async () => {
    mockClient.tools.list.mockImplementationOnce(async () => {
      const inner = new APIUserAbortError();
      const outer = new Error('Request failed during retry', { cause: inner });
      outer.name = 'APIError';
      throw outer;
    });

    await expect(
      tools.getRawComposioTools({ search: 'send email' }, undefined, {
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
  });

  it('does NOT relabel an unrelated failure as cancellation even if the signal aborts after it', async () => {
    // TOCTOU guard: classification keys on the error being abort-shaped, not just
    // on signal.aborted. A genuine failure (e.g. a 500) that happens to coincide
    // with a late abort must surface as-is, never as a caller cancellation.
    const controller = new AbortController();
    const serverError = new Error('Internal Server Error');
    mockClient.tools.list.mockImplementationOnce(async () => {
      controller.abort();
      throw serverError;
    });

    await expect(
      tools.getRawComposioTools({ search: 'send email' }, undefined, {
        signal: controller.signal,
      })
    ).rejects.toBe(serverError);
  });

  it('abort during execute surfaces as ComposioRequestCancelledError, not ComposioToolExecutionError', async () => {
    const controller = new AbortController();
    vi.spyOn(tools, 'getRawComposioToolBySlug').mockResolvedValueOnce(
      toolMocks.transformedTool as never
    );
    mockClient.tools.execute.mockImplementationOnce(async () => {
      controller.abort();
      const err = new Error('Request was aborted');
      err.name = 'APIUserAbortError';
      throw err;
    });

    try {
      await tools.execute(
        'COMPOSIO_TOOL',
        { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
        { signal: controller.signal }
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ComposioRequestCancelledError);
      expect(err).not.toBeInstanceOf(ComposioToolExecutionError);
    }
  });

  it('abort during schema retrieval surfaces as ComposioRequestCancelledError, not ComposioToolNotFoundError', async () => {
    mockClient.tools.retrieve.mockReset();
    mockClient.tools.retrieve.mockImplementationOnce(async () => {
      const err = new Error('Request was aborted');
      err.name = 'APIUserAbortError';
      throw err;
    });

    await expect(
      tools.getRawComposioToolBySlug('GITHUB_GET_REPOS', undefined, {
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
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
        signal: AbortSignal.abort(),
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ComposioRequestCancelledError);
      expect((err as Error).message).toMatch(/cancelled/i);
    }
  });
});

describe('Cancellation — execute signal forwarding', () => {
  let tools: Tools<unknown, unknown, MockProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Tools(mockClient as unknown as ComposioClient, { provider: new MockProvider() });
  });

  it('forwards signal to client.tools.execute and schema lookup', async () => {
    const controller = new AbortController();
    const requestOptions = { signal: controller.signal };

    const getRawSpy = vi.spyOn(tools, 'getRawComposioToolBySlug');
    getRawSpy.mockResolvedValueOnce(toolMocks.transformedTool as never);
    mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

    await tools.execute(
      'COMPOSIO_TOOL',
      { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
      requestOptions
    );

    expect(mockClient.tools.execute).toHaveBeenCalledWith(
      'COMPOSIO_TOOL',
      expect.any(Object),
      requestOptions
    );
    expect(getRawSpy).toHaveBeenCalledWith('COMPOSIO_TOOL', expect.any(Object), requestOptions);
  });

  it('pre-aborted signal short-circuits before modifiers run', async () => {
    vi.spyOn(tools, 'getRawComposioToolBySlug').mockResolvedValueOnce(
      toolMocks.transformedTool as never
    );

    const controller = new AbortController();
    controller.abort();

    await expect(
      tools.execute(
        'COMPOSIO_TOOL',
        { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
        { beforeExecute: vi.fn(p => p.params), signal: controller.signal }
      )
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
  });

  it('runs afterExecute to completion when the signal fires after the tool already executed', async () => {
    const controller = new AbortController();

    vi.spyOn(tools, 'getRawComposioToolBySlug').mockResolvedValueOnce(
      toolMocks.transformedTool as never
    );
    // The remote tool executes successfully, then the caller's signal fires
    // (e.g. an AbortSignal.timeout) before post-processing runs.
    mockClient.tools.execute.mockImplementationOnce(async () => {
      controller.abort();
      return toolMocks.rawToolExecuteResponse;
    });

    const afterExecute = vi.fn(({ result }) => result);

    const result = await tools.execute(
      'COMPOSIO_TOOL',
      { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
      { afterExecute, signal: controller.signal }
    );

    // The tool already committed (the side effect happened), so the abort lost
    // the race: afterExecute MUST still run rather than being silently skipped.
    expect(afterExecute).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });
});

describe('Cancellation — custom-tool AbortError classification', () => {
  it('AbortError from tool internal abort (signal NOT fired) is NOT misclassified as cancellation', async () => {
    const { z } = await import('zod');
    const { createCustomTool } = await import('../../src/models/CustomTool');
    const { executeCustomTool } = await import('../../src/models/customToolExecution');
    const customTool = createCustomTool('OWN_ABORT_TOOL', {
      name: 'Own abort',
      description: 'test',
      inputParams: z.object({}),
      execute: async () => {
        const err = new Error('Tool internal timeout');
        err.name = 'AbortError';
        throw err;
      },
    });

    const controller = new AbortController();
    const result = await executeCustomTool(
      { handle: customTool, finalSlug: 'LOCAL_OWN_ABORT_TOOL' } as never,
      {},
      createSessionContext(),
      { signal: controller.signal }
    );

    expect(result.successful).toBe(false);
    expect(result.error).toBe('Tool internal timeout');
  });

  it('AbortError after caller abort IS classified as cancellation', async () => {
    const { z } = await import('zod');
    const { createCustomTool } = await import('../../src/models/CustomTool');
    const { executeCustomTool } = await import('../../src/models/customToolExecution');
    const controller = new AbortController();

    const customTool = createCustomTool('COOP_CANCEL_TOOL', {
      name: 'Coop cancel',
      description: 'test',
      inputParams: z.object({}),
      execute: async () => {
        controller.abort();
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    });

    await expect(
      executeCustomTool(
        { handle: customTool, finalSlug: 'LOCAL_COOP_CANCEL_TOOL' } as never,
        {},
        createSessionContext(),
        { signal: controller.signal }
      )
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
  });

  it('pre-aborted signal short-circuits before custom-tool user code runs', async () => {
    const { z } = await import('zod');
    const { createCustomTool } = await import('../../src/models/CustomTool');
    const { executeCustomTool } = await import('../../src/models/customToolExecution');
    const userExecute = vi.fn();
    const customTool = createCustomTool('CUSTOM_TOOL', {
      name: 'Custom tool',
      description: 'test',
      inputParams: z.object({}),
      execute: async () => {
        await userExecute();
        return {};
      },
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      executeCustomTool(
        { handle: customTool, finalSlug: 'LOCAL_CUSTOM_TOOL' } as never,
        {},
        createSessionContext(),
        { signal: controller.signal }
      )
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
    expect(userExecute).not.toHaveBeenCalled();
  });
});

function createSessionContext(): SessionContext {
  return {
    userId: 'user_1',
    execute: vi.fn(),
    proxyExecute: vi.fn(),
  };
}

describe('Cancellation — SessionContext signal forwarding', () => {
  it('ctx.execute aborts are normalized so in-tool try/catch detects ComposioRequestCancelledError', async () => {
    const { SessionContextImpl } = await import('../../src/models/SessionContext');
    const { executeCustomTool: execCustomTool } =
      await import('../../src/models/customToolExecution');

    const controller = new AbortController();
    const sessionExecuteSpy = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new APIUserAbortError();
    });
    const fakeClient = {
      toolRouter: { session: { execute: sessionExecuteSpy, proxyExecute: vi.fn() } },
    };
    const ctxInstance = new SessionContextImpl(fakeClient as never, 'u', 's');

    let observedInToolError: unknown = undefined;
    const { z } = await import('zod');
    const customToolEntry = {
      handle: {
        slug: 'INTOOL_CATCH',
        name: 'in-tool catch',
        inputParams: z.object({}),
        execute: async (_input: unknown, ctx: SessionContext) => {
          try {
            await ctx.execute('SOMETHING', {});
            return { reached: true };
          } catch (err) {
            observedInToolError = err;
            throw err;
          }
        },
      },
    };

    await expect(
      execCustomTool(customToolEntry as never, {}, ctxInstance, {
        signal: controller.signal,
      })
    ).rejects.toBeInstanceOf(ComposioRequestCancelledError);

    expect(observedInToolError).toBeInstanceOf(ComposioRequestCancelledError);
  });
});

describe('Cancellation — composite operation forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toolkits.authorize forwards signal through every preflight call', async () => {
    const { Toolkits } = await import('../../src/models/Toolkits');
    const toolkits = new Toolkits(mockClient as unknown as ComposioClient);

    const getToolkitBySlugSpy = vi
      .spyOn(
        toolkits as unknown as { getToolkitBySlug: (...args: unknown[]) => Promise<unknown> },
        'getToolkitBySlug'
      )
      .mockResolvedValue({
        slug: 'github',
        name: 'GitHub',
        authConfigDetails: [{ mode: 'OAUTH2', fields: {} }],
      } as never);
    const { AuthConfigs } = await import('../../src/models/AuthConfigs');
    const authConfigsListSpy = vi
      .spyOn(AuthConfigs.prototype, 'list')
      .mockImplementation(async (_query, reqOpts) => {
        await mockClient.authConfigs.list({} as never, reqOpts);
        return { items: [{ id: 'ac_existing' } as never], nextCursor: null, totalPages: 1 };
      });
    mockClient.authConfigs.list.mockResolvedValueOnce({
      items: [{ id: 'ac_existing' }],
      totalPages: 1,
    } as never);
    mockClient.connectedAccounts.list.mockResolvedValueOnce({
      items: [],
      totalPages: 1,
    } as never);
    mockClient.connectedAccounts.create = vi.fn().mockResolvedValue({
      id: 'ca_new',
      connectionData: { val: { status: 'INITIATED', redirectUrl: null } },
    });

    const requestOptions = { signal: new AbortController().signal };
    await toolkits.authorize('user_1', 'github', undefined, requestOptions);

    expect(getToolkitBySlugSpy).toHaveBeenCalledWith('github', requestOptions);
    expect(authConfigsListSpy).toHaveBeenCalledWith({ toolkit: 'github' }, requestOptions);
    expect(mockClient.connectedAccounts.list).toHaveBeenCalledWith(
      expect.any(Object),
      requestOptions
    );
    expect(mockClient.connectedAccounts.create).toHaveBeenCalledWith(
      expect.any(Object),
      requestOptions
    );
  });

  it('connectedAccounts.initiate forwards signal to list preflight and create', async () => {
    const { ConnectedAccounts } = await import('../../src/models/ConnectedAccounts');
    const connectedAccounts = new ConnectedAccounts(mockClient as unknown as ComposioClient);

    mockClient.connectedAccounts.list.mockResolvedValueOnce({
      items: [],
      totalPages: 1,
    } as never);
    mockClient.connectedAccounts.create = vi.fn().mockResolvedValue({
      id: 'ca_new',
      connectionData: { val: { status: 'INITIATED', redirectUrl: null } },
    });

    const requestOptions = { signal: new AbortController().signal };
    await connectedAccounts.initiate('user_1', 'ac_1', { allowMultiple: true }, requestOptions);

    expect(mockClient.connectedAccounts.list).toHaveBeenCalledWith(
      expect.any(Object),
      requestOptions
    );
    expect(mockClient.connectedAccounts.create).toHaveBeenCalledWith(
      expect.any(Object),
      requestOptions
    );
  });

  it('connectedAccounts.link forwards signal to list preflight and link.create', async () => {
    const { ConnectedAccounts } = await import('../../src/models/ConnectedAccounts');
    const linkCreate = vi.fn().mockResolvedValue({
      connected_account_id: 'ca_new',
      redirect_url: 'https://example.test/cb',
    });
    const extendedClient = { ...mockClient, link: { create: linkCreate } };
    const connectedAccounts = new ConnectedAccounts(extendedClient as unknown as ComposioClient);

    mockClient.connectedAccounts.list.mockResolvedValueOnce({
      items: [],
      totalPages: 1,
    } as never);

    const requestOptions = { signal: new AbortController().signal };
    await connectedAccounts.link('user_1', 'ac_1', { allowMultiple: true }, requestOptions);

    expect(mockClient.connectedAccounts.list).toHaveBeenCalledWith(
      expect.any(Object),
      requestOptions
    );
    expect(linkCreate).toHaveBeenCalledWith(expect.any(Object), requestOptions);
  });
});
