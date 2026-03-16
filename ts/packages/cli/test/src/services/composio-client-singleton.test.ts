import { afterEach, describe, expect, it, vi } from 'vitest';
import { BunFileSystem } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { extendConfigProvider } from 'src/services/config';

const withConfigLayer = (map: Map<string, string>, homedir: string) =>
  Layer.mergeAll(
    BunFileSystem.layer,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir })),
    Layer.setConfigProvider(extendConfigProvider(ConfigProvider.fromMap(map)))
  );

const okResponse = () =>
  new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('ComposioClientSingleton headers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses x-user-api-key and never x-api-key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_USER_API_KEY', 'uak_from_user_env'],
      ['COMPOSIO_API_KEY', 'ak_should_be_ignored'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    const program = Effect.gen(function* () {
      const client = yield* ComposioClientSingleton.get();
      yield* Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );

    await Effect.runPromise(program);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);

    expect(headers.get('x-user-api-key')).toBe('uak_from_user_env');
    expect(headers.has('x-api-key')).toBe(false);
  });

  it('does not read COMPOSIO_API_KEY for user auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    const homedir = tempy.temporaryDirectory();
    const configMap = new Map([
      ['COMPOSIO_API_KEY', 'ak_only'],
      ['COMPOSIO_BASE_URL', 'https://backend.composio.dev'],
    ]);

    const program = Effect.gen(function* () {
      const client = yield* ComposioClientSingleton.get();
      yield* Effect.promise(() =>
        client.tools
          .list({ limit: 1, toolkit_versions: 'latest' })
          .then(() => undefined)
          .catch(() => undefined)
      );
    }).pipe(
      Effect.provide(
        Layer.provide(ComposioClientSingleton.Default, withConfigLayer(configMap, homedir))
      )
    );

    await Effect.runPromise(program);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);

    expect(headers.get('x-user-api-key')).toBeNull();
    expect(headers.has('x-api-key')).toBe(false);
  });
});
