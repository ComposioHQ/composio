import { afterEach, beforeAll, describe, expect, it, vi } from '@effect/vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Effect, Layer } from 'effect';
import { execSync } from 'node:child_process';
import * as tempy from 'tempy';
import {
  AmbiguousDeveloperProjectNameError,
  ComposioClientSingleton,
  ComposioToolkitsRepository,
  createProjectApiKey,
  findDeveloperProjectByName,
  getLatestToolVersion,
  getSessionInfoByUserApiKey,
  HttpServerError,
  InvalidToolkitsError,
  listOrganizations,
  listOrgProjects,
} from 'src/services/composio-clients';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { extendConfigProvider } from 'src/services/config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { makeOrgProject, makeSessionInfo } from 'test/__utils__/models/account';
import { makeToolkitFixture } from 'test/__utils__/models/toolkits';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const BASE_URL = 'https://backend.composio.dev';

const platformLayer = () =>
  Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempy.temporaryDirectory() })),
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      extendConfigProvider(
        ConfigProvider.fromEnv({
          env: { COMPOSIO_USER_API_KEY: 'uak_config', COMPOSIO_BASE_URL: BASE_URL },
        })
      )
    )
  );

const withSingleton = Layer.provide(ComposioClientSingleton.Default, platformLayer());
const withRepository = Layer.provide(ComposioToolkitsRepository.Default, platformLayer());

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

// Error responses opt out of the client's retry policy so a scenario sees
// exactly one request, unless the scenario is about retries.
const errorResponse = (status: number, body: unknown) =>
  jsonResponse(body, status, { 'x-should-retry': 'false' });

const errorEnvelope = (fields: { message: string; code: number; suggested_fix?: string }) => ({
  error: { slug: 'Test_Error', status: 0, ...fields },
});

const requestOf = (call: readonly unknown[] | undefined) => {
  const [input, init] = call ?? [];
  return {
    url: new URL(String(input)),
    headers: new Headers((init as RequestInit | undefined)?.headers),
  };
};

// `toolkits.list` items as the API sends them: dates as strings.
const toolkitListItem = (slug: string) => ({
  ...makeToolkitFixture(slug),
  meta: {
    ...makeToolkitFixture(slug).meta,
    created_at: '2024-05-03T11:44:32.061Z',
    updated_at: '2024-05-03T11:44:32.061Z',
  },
});

describe('composio-clients', () => {
  // Keep a real keychain entry from supplying the user key; the config
  // provider above is the only source these scenarios should see.
  beforeAll(() => {
    try {
      execSync(
        '/usr/bin/security delete-generic-password -s com.composio.cli -a default 2>/dev/null',
        { stdio: 'ignore' }
      );
    } catch {
      // Entry may not exist — fine.
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('account helpers', () => {
    it.effect('[Given] orgId [Then] session info carries x-org-id without x-project-id', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse(makeSessionInfo()));

        yield* getSessionInfoByUserApiKey({ userApiKey: 'uak_test', orgId: 'ok_selected_org' });

        const { url, headers } = requestOf(fetchSpy.mock.calls[0]);
        expect(url.pathname).toBe('/api/v3.1/auth/session/info');
        expect(headers.get('x-user-api-key')).toBe('uak_test');
        expect(headers.get('x-org-id')).toBe('ok_selected_org');
        expect(headers.has('x-project-id')).toBe(false);
        expect(headers.has('x-api-key')).toBe(false);
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('[Given] no orgId [Then] session info omits x-org-id', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse(makeSessionInfo()));

        yield* getSessionInfoByUserApiKey({ userApiKey: 'uak_test' });

        const { headers } = requestOf(fetchSpy.mock.calls[0]);
        expect(headers.get('x-user-api-key')).toBe('uak_test');
        expect(headers.has('x-org-id')).toBe(false);
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('[Given] a session without a project [Then] fails with HttpDecodingError', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          jsonResponse({ ...makeSessionInfo(), project: null })
        );

        const error = yield* getSessionInfoByUserApiKey({ userApiKey: 'uak_test' }).pipe(
          Effect.flip
        );

        expect(error._tag).toBe('services/HttpDecodingError');
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('listOrganizations returns id and name for each organization', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          jsonResponse({
            organizations: [
              { id: 'org_a', name: 'A', created_at: 'x', updated_at: 'x' },
              { id: 'org_b', name: 'B', created_at: 'x', updated_at: 'x' },
            ],
            total_pages: 1,
            current_page: 1,
            total_items: 2,
          })
        );

        const result = yield* listOrganizations({ apiKey: 'uak_test' });

        expect(result).toEqual({
          data: [
            { id: 'org_a', name: 'A' },
            { id: 'org_b', name: 'B' },
          ],
          total_items: 2,
        });
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('listOrgProjects asks for every org project, scoped to the org only', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          jsonResponse({
            data: [makeOrgProject({ id: 'p1', name: 'One' })],
            total_pages: 1,
            current_page: 1,
            total_items: 1,
          })
        );

        yield* listOrgProjects({ apiKey: 'uak_test', orgId: 'org_1' });

        const { url, headers } = requestOf(fetchSpy.mock.calls[0]);
        expect(url.pathname).toBe('/api/v3.1/org/project/list');
        expect(url.searchParams.get('list_all_org_projects')).toBe('true');
        expect(url.searchParams.get('limit')).toBe('50');
        expect(headers.get('x-org-id')).toBe('org_1');
        expect(headers.has('x-project-id')).toBe(false);
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('findDeveloperProjectByName rejects a case-insensitive name collision', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          jsonResponse({
            data: [
              makeOrgProject({ id: 'p1', name: 'Shared' }),
              makeOrgProject({ id: 'p2', name: 'shared' }),
            ],
            total_pages: 1,
            current_page: 1,
            total_items: 2,
          })
        );

        const error = yield* findDeveloperProjectByName({
          apiKey: 'uak_test',
          orgId: 'org_1',
          name: 'SHARED',
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(AmbiguousDeveloperProjectNameError);
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('createProjectApiKey returns the minted key from the response body', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ data: { api_key: 'uak_minted' } }));

        const key = yield* createProjectApiKey({
          apiKey: 'uak_test',
          orgId: 'org_1',
          projectId: 'proj_1',
          name: 'cli',
        });

        expect(key).toBe('uak_minted');
        const { url, headers } = requestOf(fetchSpy.mock.calls[0]);
        expect(url.pathname).toBe('/api/v3/org/project/proj_1/api_keys/create');
        expect(headers.get('x-org-id')).toBe('org_1');
        expect(headers.get('x-project-id')).toBe('proj_1');
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('createProjectApiKey never retries a retryable failure', () =>
      Effect.gen(function* () {
        // A bare 500 is retryable by default; the create call must still send once.
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

        const error = yield* createProjectApiKey({
          apiKey: 'uak_test',
          orgId: 'org_1',
          projectId: 'proj_1',
          name: 'cli',
        }).pipe(Effect.flip);

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(error).toBeInstanceOf(HttpServerError);
        expect((error as HttpServerError).status).toBe(500);
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('a connection failure maps to HttpServerError without a status', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

        const error = yield* createProjectApiKey({
          apiKey: 'uak_test',
          orgId: 'org_1',
          projectId: 'proj_1',
          name: 'cli',
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(HttpServerError);
        expect((error as HttpServerError).status).toBeUndefined();
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('retries a retryable failure and reports the eventual success', () =>
      Effect.gen(function* () {
        // No `x-should-retry: false` here: this scenario is about the retry
        // the owned client performs and the old hand-rolled fetch did not.
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(jsonResponse({ message: 'flaky' }, 500))
          .mockResolvedValueOnce(jsonResponse(makeSessionInfo({ orgName: 'Retried Org' })));

        const info = yield* getSessionInfoByUserApiKey({ userApiKey: 'uak_test' });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(info.project.org.name).toBe('Retried Org');
      }).pipe(Effect.provide(withSingleton))
    );

    it.effect('getLatestToolVersion with a project key sends exactly one credential', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ tool_slug: 'GMAIL_SEND_EMAIL', version: '1' }));

        const result = yield* getLatestToolVersion({
          apiKey: 'uak_test',
          toolSlug: 'GMAIL_SEND_EMAIL',
          projectApiKey: 'ak_project',
        });

        expect(result.version).toBe('1');
        const { url, headers } = requestOf(fetchSpy.mock.calls[0]);
        expect(url.pathname).toBe('/api/v3/tools/GMAIL_SEND_EMAIL/get_latest_version');
        expect(headers.get('x-api-key')).toBe('ak_project');
        expect(headers.has('x-user-api-key')).toBe(false);
      }).pipe(Effect.provide(withSingleton))
    );
  });

  describe('repository request core', () => {
    it.effect('fetches every toolkit page, sorted by slug, and counts each request', () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(
            jsonResponse({
              items: [toolkitListItem('slack'), toolkitListItem('gmail')],
              next_cursor: 'page_2',
              total_pages: 2,
              current_page: 1,
              total_items: 3,
            })
          )
          .mockResolvedValueOnce(
            jsonResponse({
              items: [toolkitListItem('asana')],
              next_cursor: null,
              total_pages: 2,
              current_page: 2,
              total_items: 3,
            })
          );
        const repository = yield* ComposioToolkitsRepository;

        const toolkits = yield* repository.getToolkits();

        expect(toolkits.map(t => t.slug)).toEqual(['asana', 'gmail', 'slack']);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(requestOf(fetchSpy.mock.calls[0]).url.searchParams.get('limit')).toBe('1000');
        expect(requestOf(fetchSpy.mock.calls[1]).url.searchParams.get('cursor')).toBe('page_2');
        const metrics = yield* repository.getMetrics();
        expect(metrics.requests).toBe(2);
        expect(metrics.byteSize).toBeGreaterThan(0);
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('a list item that breaks the catalog contract fails with HttpDecodingError', () =>
      Effect.gen(function* () {
        const { meta: _meta, ...withoutMeta } = toolkitListItem('gmail');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          jsonResponse({ items: [withoutMeta], next_cursor: null, total_pages: 1 })
        );
        const repository = yield* ComposioToolkitsRepository;

        const error = yield* repository.getToolkits().pipe(Effect.flip);

        expect(error._tag).toBe('services/HttpDecodingError');
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('an API error envelope maps onto status, details, and suggestedFix', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          errorResponse(
            404,
            errorEnvelope({ message: 'Not found', code: 404, suggested_fix: 'Check the id' })
          )
        );
        const repository = yield* ComposioToolkitsRepository;

        const error = yield* repository.getAuthConfig('ac_missing').pipe(Effect.flip);

        expect(error).toBeInstanceOf(HttpServerError);
        expect(error).toMatchObject({
          status: 404,
          details: { message: 'Not found', code: 404, suggestedFix: 'Check the id' },
        });
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('a non-envelope error body keeps the status and leaves details undefined', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          errorResponse(502, { message: 'Bad gateway' })
        );
        const repository = yield* ComposioToolkitsRepository;

        const error = yield* repository.getAuthConfig('ac_1').pipe(Effect.flip);

        expect(error).toMatchObject({ status: 502, details: undefined });
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('an envelope without suggested_fix renders without a suggested-fix line', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          errorResponse(400, errorEnvelope({ message: 'Bad input', code: 1001 }))
        );
        const repository = yield* ComposioToolkitsRepository;
        const error = yield* repository.getAuthConfig('ac_1').pipe(Effect.flip);
        expect(error).toMatchObject({
          details: { message: 'Bad input', code: 1001, suggestedFix: undefined },
        });

        const errors: string[] = [];
        const steps: string[] = [];
        const ui = TerminalUI.of({
          ...terminalUITestImpl,
          log: {
            ...terminalUITestImpl.log,
            error: message => Effect.sync(() => void errors.push(message)),
            step: message => Effect.sync(() => void steps.push(message)),
          },
        });
        const previousExitCode = process.exitCode;
        yield* handleHttpServerError(ui, {
          fallbackMessage: 'fallback',
          hint: 'hint',
          fallbackValue: undefined,
        })(error as HttpServerError);
        process.exitCode = previousExitCode;

        expect(errors).toEqual(['Bad input']);
        expect(steps).toEqual(['hint']);
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('drops credential-bearing fields from auth configs and connected accounts', () =>
      Effect.gen(function* () {
        const authConfig = {
          id: 'ac_1',
          uuid: 'uuid_ac_1',
          name: 'Gmail auth',
          no_of_connections: 0,
          status: 'ENABLED',
          type: 'default',
          toolkit: { slug: 'gmail', logo: '' },
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          credentials: { client_secret: 'secret_credentials' },
          shared_credentials: { token: 'secret_shared' },
          proxy_config: { url: 'https://proxy', api_key: 'secret_proxy' },
          deprecated: { secret: 'secret_deprecated' },
        };
        const connectedAccount = {
          id: 'con_1',
          status: 'ACTIVE',
          status_reason: null,
          is_disabled: false,
          user_id: 'default',
          toolkit: { slug: 'gmail' },
          auth_config: {
            id: 'ac_1',
            auth_scheme: 'OAUTH2',
            is_composio_managed: true,
            is_disabled: false,
          },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          test_request_endpoint: '',
          state: { val: { access_token: 'secret_state' } },
          data: { access_token: 'secret_data' },
          params: { refresh_token: 'secret_params' },
        };
        vi.spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(jsonResponse(authConfig))
          .mockResolvedValueOnce(
            jsonResponse({
              items: [connectedAccount],
              total_items: 1,
              total_pages: 1,
              current_page: 1,
              next_cursor: null,
            })
          );
        const repository = yield* ComposioToolkitsRepository;

        const decodedAuthConfig = yield* repository.getAuthConfig('ac_1');
        const accounts = yield* repository.listConnectedAccounts({});

        expect(JSON.stringify(decodedAuthConfig)).not.toContain('secret');
        expect(JSON.stringify(accounts)).not.toContain('secret');
        expect(accounts.items.map(item => item.id)).toEqual(['con_1']);
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('getToolkitsBySlugs turns a 404 into InvalidToolkitsError naming the slug', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          errorResponse(404, errorEnvelope({ message: 'Toolkit not found', code: 404 }))
        );
        const repository = yield* ComposioToolkitsRepository;

        const error = yield* repository.getToolkitsBySlugs(['ghost']).pipe(Effect.flip);

        expect(error).toBeInstanceOf(InvalidToolkitsError);
        expect((error as InvalidToolkitsError).invalidToolkits).toEqual(['ghost']);
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('getToolkitsBySlugs propagates a 500 as HttpServerError', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          errorResponse(500, errorEnvelope({ message: 'Server error', code: 500 }))
        );
        const repository = yield* ComposioToolkitsRepository;

        const error = yield* repository.getToolkitsBySlugs(['gmail']).pipe(Effect.flip);

        expect(error).toBeInstanceOf(HttpServerError);
        expect((error as HttpServerError).status).toBe(500);
      }).pipe(Effect.provide(withRepository))
    );

    it.effect('validateToolkitVersions ignores an override outside the filter', () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const repository = yield* ComposioToolkitsRepository;

        const result = yield* repository.validateToolkitVersions(
          new Map([['slack', '20250101_00']]),
          ['gmail']
        );

        expect(result.validatedOverrides.size).toBe(0);
        expect(result.warnings).toEqual([
          'Version override for "slack" will be ignored (toolkit not in --toolkits filter)',
        ]);
        expect(fetchSpy).not.toHaveBeenCalled();
      }).pipe(Effect.provide(withRepository))
    );
  });
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
