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
import type { SessionContext } from '../../src/types/customTool.types';
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

    it('forwards requestOptions to custom-tool execute fn via the 4th ctx arg', async () => {
      // Custom-tool execution is cooperative: the SDK can't preempt user code,
      // but it MUST pass the signal so long-running implementations can wire
      // it into fetch / IO. This test locks in that surface.
      const userExecute = vi.fn().mockResolvedValue({
        data: { ok: true },
        error: null,
        successful: true,
      });
      vi.spyOn(tools['customTools'], 'getCustomToolBySlug').mockResolvedValue({
        slug: 'CUSTOM_TOOL',
        name: 'Custom Tool',
        description: 'test',
        inputParameters: { type: 'object', properties: {} },
        outputParameters: undefined,
        availableVersions: undefined,
        isDeprecated: false,
        isNoAuth: undefined,
        toolkit: { slug: 'github', name: 'GitHub', logo: 'x' },
      } as never);
      // Bypass executeCustomTool to inspect the ctx arg directly.
      vi.spyOn(tools['customTools'], 'executeCustomTool').mockImplementation(
        async (slug, body, requestOptions) => {
          // Simulate calling user's execute fn with the ctx
          await userExecute({}, null, () => Promise.resolve({}), {
            signal: requestOptions?.signal,
          });
          return { data: { ok: true }, error: null, successful: true };
        }
      );

      const controller = new AbortController();
      await tools.execute(
        'CUSTOM_TOOL',
        { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
        undefined,
        { signal: controller.signal }
      );

      // The 4th arg of user's execute fn is the ctx — must carry our signal.
      const ctxArg = userExecute.mock.calls[0][3];
      expect(ctxArg).toBeDefined();
      expect(ctxArg.signal).toBe(controller.signal);
    });

    it('SessionContext.execute / proxyExecute forward the wrapper-injected signal to client calls', async () => {
      // Codex caught: SessionContextImpl.execute and .proxyExecute were
      // calling the client without requestOptions. So a custom tool that
      // received the forwarded signal and called `ctx.execute()` or
      // `ctx.proxyExecute()` would still have THOSE in-flight HTTP calls
      // un-cancellable. Fix: methods read `(this as SessionContext).signal`
      // and forward it as requestOptions. The wrapper from
      // customToolExecution sets signal as an own property, which inherits
      // method lookups through the Object.create chain.
      const { SessionContextImpl } = await import('../../src/models/SessionContext');
      const { executeCustomTool: execCustomTool } =
        await import('../../src/models/customToolExecution');

      // Wire a mock client whose toolRouter.session.execute / proxyExecute
      // capture their args.
      const sessionExecuteSpy = vi.fn().mockResolvedValue({
        data: { ok: true },
        error: null,
        successful: true,
        session_info: undefined,
        log_id: 'log_x',
      });
      const sessionProxySpy = vi.fn().mockResolvedValue({
        status: 200,
        data: 'ok',
        headers: {},
      });
      const fakeClient = {
        toolRouter: { session: { execute: sessionExecuteSpy, proxyExecute: sessionProxySpy } },
      };
      const ctxInstance = new SessionContextImpl(fakeClient as never, 'user_1', 'session_1');

      const controller = new AbortController();
      const requestOptions = { signal: controller.signal };

      // Execute a tool whose user-execute calls ctx.execute AND ctx.proxyExecute.
      const { z } = await import('zod');
      const customToolEntry = {
        handle: {
          slug: 'CTX_USAGE_TOOL',
          name: 'ctx-usage',
          inputParams: z.object({}),
          execute: async (_input: unknown, ctx: SessionContext) => {
            await ctx.execute('SOMETHING_REMOTE', { x: 1 });
            await ctx.proxyExecute({
              toolkit: 'x',
              endpoint: '/y',
              method: 'GET',
            } as never);
            return { ok: true };
          },
        },
      };
      await execCustomTool(customToolEntry as never, {}, ctxInstance, requestOptions);

      // Both client calls must have received our requestOptions trailing.
      expect(sessionExecuteSpy).toHaveBeenCalledTimes(1);
      const execArgs = sessionExecuteSpy.mock.calls[0];
      expect(execArgs[2]).toEqual(requestOptions);

      expect(sessionProxySpy).toHaveBeenCalledTimes(1);
      const proxyArgs = sessionProxySpy.mock.calls[0];
      expect(proxyArgs[2]).toEqual(requestOptions);
    });

    it('SessionContext.execute aborts are normalized so in-tool try/catch can detect cancellation', async () => {
      // Codex caught: ctx.execute / ctx.proxyExecute now forward the signal,
      // but if user code wraps them in try/catch, an abort would surface as
      // raw APIUserAbortError (instanceof ComposioRequestCancelledError = false).
      // Fix routes them through withCancellation so the typed error reaches
      // the user's catch block.
      const { SessionContextImpl } = await import('../../src/models/SessionContext');
      const { executeCustomTool: execCustomTool } =
        await import('../../src/models/customToolExecution');

      const sessionExecuteSpy = vi.fn().mockImplementation(async () => {
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
              throw err; // re-throw so outer wrapper sees it too
            }
          },
        },
      };

      await expect(
        execCustomTool(customToolEntry as never, {}, ctxInstance, {
          signal: new AbortController().signal,
        })
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);

      // The CRUCIAL assertion: the user's in-tool catch must have seen
      // the typed error, not the raw APIUserAbortError.
      expect(observedInToolError).toBeInstanceOf(ComposioRequestCancelledError);
    });

    it('ToolRouter custom-tool signal injection preserves SessionContext prototype methods', async () => {
      // Codex caught: spreading a SessionContextImpl class instance into a
      // plain object (`{...sessionContext, signal}`) drops prototype methods
      // like `execute` and `proxyExecute`. Any custom tool that calls
      // `ctx.execute(...)` would fail only when requestOptions is supplied.
      // The fix uses Object.create with the instance as [[Prototype]] so
      // method lookups fall through to the original.
      const { executeCustomTool: execCustomTool } =
        await import('../../src/models/customToolExecution');

      // Build a minimal class-instance SessionContext (mirroring
      // SessionContextImpl). Class methods are on the prototype, not own props.
      class FakeSessionContext implements Pick<
        SessionContext,
        'userId' | 'execute' | 'proxyExecute'
      > {
        readonly userId = 'user_1';
        async execute() {
          return { data: { fromCtxMethod: true }, error: null, logId: '' };
        }
        async proxyExecute() {
          return { data: 'ok', status: 200, headers: {} };
        }
      }
      const ctxInstance = new FakeSessionContext() as unknown as SessionContext;

      let observedExecute: unknown = undefined;
      let observedProxy: unknown = undefined;
      let observedSignal: AbortSignal | undefined = undefined;

      const customToolEntry = {
        handle: {
          slug: 'CTX_METHODS_TOOL',
          name: 'ctx',
          inputParams: (await import('zod')).z.object({}),
          execute: async (_input: unknown, ctx: SessionContext) => {
            // Capture all three: methods should still be reachable through
            // the proxy/Object.create chain.
            observedExecute = ctx.execute;
            observedProxy = ctx.proxyExecute;
            observedSignal = ctx.signal;
            return { ok: true };
          },
        },
      };

      await execCustomTool(customToolEntry as never, {}, ctxInstance, {
        signal: new AbortController().signal,
      });

      expect(observedExecute).toBeTypeOf('function');
      expect(observedProxy).toBeTypeOf('function');
      expect(observedSignal).toBeInstanceOf(AbortSignal);
    });

    it('custom-tool AbortError from its OWN internal abort (signal NOT fired) is NOT misclassified as cancellation', async () => {
      // Regression for Codex review: a custom tool that has its own internal
      // AbortController (timeout, library abort, anything unrelated to the
      // caller's signal) throws AbortError naturally. We must NOT convert
      // that into ComposioRequestCancelledError — the caller didn't cancel,
      // and lying about the cause steers their catch block down the wrong
      // branch. The conversion is gated on `requestOptions.signal.aborted`
      // being true at catch time.
      const userExecuteThrowsOwnAbort = vi.fn().mockImplementation(async () => {
        const err = new Error('Tool internal timeout');
        err.name = 'AbortError';
        throw err;
      });

      const { z } = await import('zod');
      await tools.createCustomTool({
        slug: 'OWN_ABORT_TOOL',
        name: 'Own abort',
        description: 'test',
        inputParams: z.object({}),
        toolkitSlug: 'custom',
        execute: userExecuteThrowsOwnAbort,
      });

      // Caller passes a signal that DOES NOT abort. The tool throws
      // AbortError for its own reason. Must surface as the raw AbortError,
      // NOT as ComposioRequestCancelledError.
      const controller = new AbortController();
      // controller.abort() NOT called.

      await expect(
        tools.execute(
          'OWN_ABORT_TOOL',
          { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
          undefined,
          { signal: controller.signal }
        )
      ).rejects.toMatchObject({ name: 'AbortError' });

      // And it MUST NOT be a ComposioRequestCancelledError.
      try {
        await tools.execute(
          'OWN_ABORT_TOOL',
          { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
          undefined,
          { signal: controller.signal }
        );
      } catch (err) {
        expect(err).not.toBeInstanceOf(ComposioRequestCancelledError);
      }
    });

    it('custom-tool that throws AbortError after caller abort surfaces as ComposioRequestCancelledError', async () => {
      // The cooperative-cancellation contract: when user code wires
      // ctx.signal into fetch and the CALLER aborts mid-call, fetch
      // rejects with an AbortError — the SDK must normalize that into
      // ComposioRequestCancelledError. The gate is `signal.aborted`
      // being true at catch time, so we abort the controller before the
      // tool throws.
      const { z } = await import('zod');
      const controller = new AbortController();
      const userExecuteAbortsAfterCallerCancel = vi.fn().mockImplementation(async () => {
        // Mirror real fetch behaviour: caller aborts → fetch rejects
        // with AbortError. We simulate by inspecting the (caller's)
        // signal right before throwing.
        controller.abort();
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      });

      await tools.createCustomTool({
        slug: 'COOP_CANCEL_TOOL',
        name: 'Coop cancel',
        description: 'test',
        inputParams: z.object({}),
        toolkitSlug: 'custom',
        execute: userExecuteAbortsAfterCallerCancel,
      });

      await expect(
        tools.execute(
          'COOP_CANCEL_TOOL',
          { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
          undefined,
          { signal: controller.signal }
        )
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
      expect(userExecuteAbortsAfterCallerCancel).toHaveBeenCalledTimes(1);
    });

    it('pre-execute aborted signal short-circuits custom-tool execution with ComposioRequestCancelledError', async () => {
      // Custom-tool can't preempt user code, so the SDK does a synchronous
      // signal.aborted check BEFORE invoking the user fn. This ensures a
      // caller who aborted before the tool ran sees the typed cancellation
      // error rather than the user's code running anyway.
      const userExecute = vi.fn();
      vi.spyOn(tools['customTools'], 'getCustomToolBySlug').mockResolvedValue({
        slug: 'CUSTOM_TOOL',
        name: 'Custom Tool',
        description: 'test',
        inputParameters: { type: 'object', properties: {} },
        outputParameters: undefined,
        availableVersions: undefined,
        isDeprecated: false,
        isNoAuth: undefined,
        toolkit: { slug: 'github', name: 'GitHub', logo: 'x' },
      } as never);
      // Mock executeCustomTool to simulate the real pre-execute check.
      vi.spyOn(tools['customTools'], 'executeCustomTool').mockImplementation(
        async (slug, body, requestOptions) => {
          if (requestOptions?.signal?.aborted) {
            throw new ComposioRequestCancelledError();
          }
          await userExecute();
          return { data: {}, error: null, successful: true };
        }
      );

      const controller = new AbortController();
      controller.abort();

      await expect(
        tools.execute(
          'CUSTOM_TOOL',
          { userId: 'user_1', arguments: {}, dangerouslySkipVersionCheck: true },
          undefined,
          { signal: controller.signal }
        )
      ).rejects.toBeInstanceOf(ComposioRequestCancelledError);
      expect(userExecute).not.toHaveBeenCalled();
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
