import { afterEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Fiber, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import * as tempy from 'tempy';
import { createToolRouterSessionContext } from 'src/effects/create-tool-router-session';
import { ComposioCliUserConfigLive } from 'src/services/cli-user-config';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { DashboardToolExecution } from 'src/services/dashboard-tool-execution';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { cliDebugFlagsLayer } from 'src/services/runtime-flags';
import { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { ToolsExecutor, ToolsExecutorLive } from 'src/services/tools-executor';
import { ComposioUserContextLive } from 'src/services/user-context';
import { clearInProcessMemos } from 'src/utils/memoize-in-process';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

// Exercise real user-context/config resolution without opening the OS credential store.
vi.mock('@composio/cli-keyring/effect', async importOriginal => {
  const actual = await importOriginal<typeof import('@composio/cli-keyring/effect')>();
  const { Effect, Layer } = await import('effect');
  const { KeyringError } = await import('@composio/cli-keyring');
  return {
    ...actual,
    KeyringLiveWithBackend: () =>
      Layer.succeed(actual.KeyringService, {
        getPassword: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        getSecret: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        setPassword: () => Effect.die(new Error('Unexpected credential write')),
        setSecret: () => Effect.die(new Error('Unexpected credential write')),
        deleteCredential: () => Effect.die(new Error('Unexpected credential deletion')),
        isAvailable: Effect.succeed(true),
      }),
  };
});

const BASE_URL = 'https://backend.composio.dev';

const platformLayer = () =>
  Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempy.temporaryDirectory() })),
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({
        env: { COMPOSIO_USER_API_KEY: 'uak_config', COMPOSIO_BASE_URL: BASE_URL },
      })
    )
  );

const withSingleton = () => Layer.provide(ComposioClientSingleton.Default, platformLayer());

// The real executor over the real client singleton, plus every service that
// `execute` and session creation require, with the credential store mocked above.
const withExecutor = () => {
  const platform = platformLayer();
  const singleton = Layer.provide(ComposioClientSingleton.Default, platform);
  const repository = Layer.provide(ComposioToolkitsRepository.Default, platform);
  const catalog = Layer.provide(ToolkitSlugCatalog.Default, Layer.mergeAll(repository, platform));
  // Never called here: every execution in this file targets the backend.
  const dashboard = Layer.provide(
    DashboardToolExecution.Default,
    Layer.mergeAll(Layer.provide(ComposioUserContextLive, platform), FetchHttpClient.layer)
  );
  return Layer.mergeAll(
    Layer.provide(ToolsExecutorLive, Layer.mergeAll(singleton, catalog, dashboard)),
    singleton,
    repository,
    platform,
    NodeProcess.Default,
    Layer.provide(ComposioUserContextLive, platform),
    Layer.provide(ComposioCliUserConfigLive, Layer.mergeAll(platform, NodeProcess.Default)),
    TerminalUITest,
    cliDebugFlagsLayer()
  );
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * A `fetch` answer that never settles on its own: it hands out the request's
 * `AbortSignal` and rejects only once that signal fires. Pair it with
 * `mockImplementationOnce` so one chosen request hangs.
 */
const pendingRequest = () => {
  const started = Promise.withResolvers<AbortSignal>();
  const respond = (_input: string | URL | Request, init?: RequestInit) => {
    const signal = init!.signal!;
    started.resolve(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  return { respond, signal: Effect.promise(() => started.promise) };
};

const requestUrl = (call: readonly unknown[] | undefined) => new URL(String(call?.[0]));

describe('interrupting a single-shot client request', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearInProcessMemos();
  });

  it.effect('connectedAccounts.list aborts the in-flight request', () =>
    Effect.gen(function* () {
      const pending = pendingRequest();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(pending.respond);
      const client = yield* Effect.flatMap(ComposioClientSingleton, singleton => singleton.get());

      const fiber = yield* Effect.forkChild(
        client.connectedAccounts.list({ user_ids: ['default'], statuses: ['ACTIVE'] })
      );
      const requestSignal = yield* pending.signal;
      expect(requestSignal.aborted).toBe(false);

      yield* Fiber.interrupt(fiber);

      expect(requestSignal.aborted).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(requestUrl(fetchSpy.mock.calls[0]).pathname).toBe('/api/v3.1/connected_accounts');
    }).pipe(Effect.provide(withSingleton()))
  );

  it.effect('tool router session creation aborts the in-flight create request', () =>
    Effect.gen(function* () {
      const pending = pendingRequest();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        // The connection context the session is built from.
        .mockResolvedValueOnce(jsonResponse({ items: [] }))
        .mockImplementationOnce(pending.respond);
      const client = yield* Effect.flatMap(ComposioClientSingleton, singleton => singleton.get());

      const fiber = yield* Effect.forkChild(createToolRouterSessionContext(client, 'default'));
      const requestSignal = yield* pending.signal;
      expect(requestSignal.aborted).toBe(false);

      yield* Fiber.interrupt(fiber);

      expect(requestSignal.aborted).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestUrl(fetchSpy.mock.calls[1]).pathname).toBe('/api/v3.1/tool_router/session');
    }).pipe(Effect.provide(withExecutor()))
  );

  it.effect('a tool execution aborts the in-flight execute request', () =>
    Effect.gen(function* () {
      const pending = pendingRequest();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        // The connection context, then the session the execution runs in.
        .mockResolvedValueOnce(jsonResponse({ items: [] }))
        .mockResolvedValueOnce(jsonResponse({ session_id: 'trs_interrupted' }))
        .mockImplementationOnce(pending.respond);
      const executor = yield* ToolsExecutor;

      // A meta tool: its execution needs no toolkit lookup and no input
      // schema, so the hanging request is the execution itself.
      const fiber = yield* Effect.forkChild(
        executor.execute('COMPOSIO_SEARCH_TOOLS', {
          userId: 'default',
          target: { kind: 'backend' },
          arguments: { queries: [{ use_case: 'send an email' }] },
        })
      );
      const requestSignal = yield* pending.signal;
      expect(requestSignal.aborted).toBe(false);

      yield* Fiber.interrupt(fiber);

      expect(requestSignal.aborted).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(requestUrl(fetchSpy.mock.calls[2]).pathname).toBe(
        '/api/v3.1/tool_router/session/trs_interrupted/execute_meta'
      );
    }).pipe(Effect.provide(withExecutor()))
  );
});
