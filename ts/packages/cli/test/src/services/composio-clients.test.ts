import { describe, expect, it } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import {
  ComposioToolkitsRepository,
  getSessionInfoByUserApiKey,
} from 'src/services/composio-clients';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { extendConfigProvider } from 'src/services/config';

const emptyOkResponse = () =>
  new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('getSessionInfoByUserApiKey org context', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The response body does not satisfy SessionInfoResponse, so decoding fails —
  // but the fetch call (whose headers we assert) has already happened by then.
  const callIgnoringDecode = (params: { baseURL: string; userApiKey: string; orgId?: string }) =>
    getSessionInfoByUserApiKey(params).pipe(Effect.ignore);

  it.effect(
    '[Given] orgId [Then] forwards it as x-org-id so the backend honors the switched org',
    () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(emptyOkResponse());

        yield* callIgnoringDecode({
          baseURL: 'https://backend.composio.dev',
          userApiKey: 'uak_test',
          orgId: 'ok_selected_org',
        });

        const [url, init] = fetchSpy.mock.calls[0]!;
        expect(String(url)).toContain('/api/v3/auth/session/info');
        const headers = new Headers((init as RequestInit).headers);
        expect(headers.get('x-user-api-key')).toBe('uak_test');
        expect(headers.get('x-org-id')).toBe('ok_selected_org');
      })
  );

  it.effect('[Given] no orgId [Then] omits x-org-id (login-time behavior is unchanged)', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(emptyOkResponse());

      yield* callIgnoringDecode({
        baseURL: 'https://backend.composio.dev',
        userApiKey: 'uak_test',
      });

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('x-user-api-key')).toBe('uak_test');
      expect(headers.has('x-org-id')).toBe(false);
    })
  );
});

describe('ComposioToolkitsRepository toolkit lists', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The real repository over the real client, with no `ProjectContext`: the
  // consumer-mode setup, where only an explicit scope names a project.
  const repositoryLayer = () =>
    Layer.provide(
      ComposioToolkitsRepository.Default,
      Layer.mergeAll(
        BunFileSystem.layer,
        BunPath.layer,
        Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempy.temporaryDirectory() })),
        Layer.succeed(
          ConfigProvider.ConfigProvider,
          extendConfigProvider(
            ConfigProvider.fromEnv({
              env: {
                COMPOSIO_USER_API_KEY: 'uak_test',
                COMPOSIO_BASE_URL: 'https://backend.composio.dev',
              },
            })
          )
        )
      )
    );

  // An empty last page: what is asserted is the request, not the decoding.
  const spyOnToolkitsFetch = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [], total_pages: 1, next_cursor: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );

  const requestOf = (fetchSpy: ReturnType<typeof spyOnToolkitsFetch>) => {
    const [input, init] = fetchSpy.mock.calls[0]!;
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    return { url, headers };
  };

  it.effect(
    '[Given] a scope [Then] getProjectToolkits lists managed_by=project for that project',
    () =>
      Effect.gen(function* () {
        const fetchSpy = spyOnToolkitsFetch();
        const repository = yield* ComposioToolkitsRepository;

        yield* repository.getProjectToolkits({ orgId: 'org_scoped', projectId: 'pr_scoped' });

        expect(fetchSpy).toHaveBeenCalledOnce();
        const { url, headers } = requestOf(fetchSpy);
        expect(url.pathname).toBe('/api/v3.1/toolkits');
        expect(url.searchParams.get('managed_by')).toBe('project');
        expect(headers.get('x-org-id')).toBe('org_scoped');
        expect(headers.get('x-project-id')).toBe('pr_scoped');
      }).pipe(Effect.provide(repositoryLayer()))
  );

  it.effect('[Given] no scope [Then] getToolkits lists without managed_by or a project', () =>
    Effect.gen(function* () {
      const fetchSpy = spyOnToolkitsFetch();
      const repository = yield* ComposioToolkitsRepository;

      yield* repository.getToolkits();

      expect(fetchSpy).toHaveBeenCalledOnce();
      const { url, headers } = requestOf(fetchSpy);
      expect(url.pathname).toBe('/api/v3.1/toolkits');
      expect(url.searchParams.has('managed_by')).toBe(false);
      expect(headers.has('x-org-id')).toBe(false);
      expect(headers.has('x-project-id')).toBe(false);
    }).pipe(Effect.provide(repositoryLayer()))
  );
});
