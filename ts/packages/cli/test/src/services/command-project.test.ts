import { afterEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { APIConnectionError } from '@composio/client/effect';
import { ConfigProvider, Effect, Fiber, Layer, Option } from 'effect';
import { TestClock } from 'effect/testing';
import * as tempy from 'tempy';
import {
  ProjectResolutionError,
  resolveCommandProject,
  resolveDeveloperProjectOrDefault,
} from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { makeOrgProject, makeSessionInfo } from 'test/__utils__/models/account';

const BASE_URL = 'https://backend.composio.dev';

const userContext = (
  orgId: Option.Option<string>,
  apiKey: Option.Option<string> = Option.some('uak_test')
) =>
  Layer.succeed(
    ComposioUserContext,
    ComposioUserContext.of({
      data: {
        apiKey,
        baseURL: BASE_URL,
        webURL: 'https://app.composio.dev',
        orgId,
        projectId: Option.none(),
        testUserId: Option.none(),
      },
      backendMismatch: Option.none(),
      isLoggedIn: () => true,
      logout: Effect.void,
      login: () => Effect.void,
      update: () => Effect.void,
    })
  );

const noLocalProject = Layer.succeed(
  ProjectContext,
  ProjectContext.of({ resolve: Effect.succeed(Option.none()) })
);

const singleton = Layer.provide(
  ComposioClientSingleton.Default,
  Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempy.temporaryDirectory() })),
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({
        env: { COMPOSIO_USER_API_KEY: 'uak_test', COMPOSIO_BASE_URL: BASE_URL },
      })
    )
  )
);

const testLayer = Layer.mergeAll(singleton, userContext(Option.some('org_1')), noLocalProject);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-should-retry': 'false' },
  });

const projectsPage = (names: ReadonlyArray<string>) =>
  jsonResponse({
    data: names.map((name, index) => makeOrgProject({ id: `p${index + 1}`, name })),
    total_pages: 1,
    current_page: 1,
    total_items: names.length,
  });

const localProject = (orgId: string) =>
  Layer.succeed(
    ProjectContext,
    ProjectContext.of({
      resolve: Effect.succeed(
        Option.some({
          orgId,
          projectId: 'pr_local',
          projectName: Option.some('local-app'),
          orgName: Option.none(),
          email: Option.none(),
          testUserId: Option.none(),
        })
      ),
    })
  );

const orgList = (ids: ReadonlyArray<string>, nextCursor: string | null = null) =>
  jsonResponse({
    organizations: ids.map(id => ({
      id,
      name: id,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })),
    next_cursor: nextCursor,
    total_pages: 1,
    current_page: 1,
    total_items: ids.length,
  });

describe('resolveCommandProject', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect('fails with missing_org before any request when no org is configured', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const error = yield* resolveCommandProject({ mode: 'consumer' }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(ProjectResolutionError);
      expect(error).toMatchObject({
        reason: 'missing_org',
        message: 'No current org configured. Run `composio login` or `composio orgs switch`.',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(Effect.provide(Layer.mergeAll(singleton, userContext(Option.none()), noLocalProject)))
  );

  it.effect('fails with missing_developer_project when nothing binds the directory', () =>
    Effect.gen(function* () {
      const error = yield* resolveCommandProject({ mode: 'developer' }).pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: 'services/ProjectResolutionError',
        reason: 'missing_developer_project',
        message: 'No developer project configured for this directory. Run `composio dev init`.',
      });
    }).pipe(Effect.provide(testLayer))
  );

  it.effect('refuses a directory project outside the logged-in org without a request', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const error = yield* resolveCommandProject({ mode: 'developer' }).pipe(Effect.flip);

      expect(error).toMatchObject({ reason: 'org_mismatch' });
      expect(error.message).toContain('"org_other"');
      expect(error.message).toContain('composio orgs switch');
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(
        Layer.mergeAll(singleton, userContext(Option.some('org_1')), localProject('org_other'))
      )
    )
  );

  it.effect('resolves a directory project in the logged-in org without a request', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const project = yield* resolveCommandProject({ mode: 'developer' });
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(project).toMatchObject({
        orgId: 'org_1',
        projectId: 'pr_local',
        source: 'developer-local-config',
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(singleton, userContext(Option.some('org_1')), localProject('org_1'))
      )
    )
  );

  it.effect(
    'checks a directory project against every page of the key orgs when none is stored',
    () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(orgList(['org_a'], 'cursor_2'))
          .mockResolvedValueOnce(orgList(['org_2']));

        const project = yield* resolveCommandProject({ mode: 'developer' });

        expect(project).toMatchObject({ orgId: 'org_2', projectId: 'pr_local' });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      }).pipe(
        Effect.provide(Layer.mergeAll(singleton, userContext(Option.none()), localProject('org_2')))
      )
  );

  it.effect('refuses a directory project from another org when no org is stored', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(orgList(['org_mine']));

      const error = yield* resolveCommandProject({ mode: 'developer' }).pipe(Effect.flip);

      expect(error).toMatchObject({ reason: 'org_mismatch' });
      expect(error.message).toContain('cannot access');
    }).pipe(
      Effect.provide(Layer.mergeAll(singleton, userContext(Option.none()), localProject('org_2')))
    )
  );

  it.effect('turns an unknown project name into project_not_found with the remedy', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(projectsPage(['Other']));

      const error = yield* resolveCommandProject({
        mode: 'developer',
        projectName: 'Missing',
      }).pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: 'services/ProjectResolutionError',
        reason: 'project_not_found',
        message:
          'Developer project "Missing" was not found in org "org_1". Run `composio dev init` or `composio dev projects list`.',
      });
    }).pipe(Effect.provide(testLayer))
  );

  it.effect('turns a name collision into ambiguous_project_name', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(projectsPage(['Shared', 'shared']));

      const error = yield* resolveCommandProject({
        mode: 'consumer',
        projectName: 'SHARED',
      }).pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: 'services/ProjectResolutionError',
        reason: 'ambiguous_project_name',
        message:
          'Developer project name "SHARED" is ambiguous in org "org_1". Use an exact unique project name.',
      });
    }).pipe(Effect.provide(testLayer))
  );

  it.effect('turns an API error into request_failed carrying the server message', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(
          { error: { slug: 'Forbidden', status: 403, code: 403, message: 'Org access revoked.' } },
          403
        )
      );

      const error = yield* resolveCommandProject({
        mode: 'developer',
        projectName: 'Any',
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(ProjectResolutionError);
      expect(error).toMatchObject({ reason: 'request_failed', message: 'Org access revoked.' });
      expect((error as ProjectResolutionError).cause).toMatchObject({ status: 403 });
    }).pipe(Effect.provide(testLayer))
  );

  it.effect('passes a connection failure through with its own type', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      // The client retries a connection failure with a backoff on Effect's clock, so run the
      // lookup on its own fiber and move the test clock past every retry before joining. The
      // first backoff is armed only after client construction and a rejected fetch promise, so
      // advance in bounded steps until the fiber has settled rather than assuming one yield
      // reaches it.
      const fiber = yield* resolveCommandProject({ mode: 'developer', projectName: 'Any' }).pipe(
        Effect.flip,
        Effect.forkChild
      );
      yield* Effect.yieldNow.pipe(
        Effect.andThen(TestClock.adjust('1 minute')),
        Effect.repeat({ until: () => fiber.pollUnsafe() !== undefined, times: 100 })
      );
      expect(fiber.pollUnsafe()).toBeDefined();
      const error = yield* Fiber.join(fiber);

      expect(error).not.toBeInstanceOf(ProjectResolutionError);
      expect(error).toBeInstanceOf(APIConnectionError);
    }).pipe(Effect.provide(testLayer))
  );
});

// The backend's default developer project, as session info reports it.
const defaultProjectInfo = (orgId: string) =>
  jsonResponse(makeSessionInfo({ orgId, projectNanoId: 'pr_newest', projectName: 'Newest App' }));

const requestOf = (call: ReadonlyArray<unknown> | undefined) => {
  const [input, init] = call ?? [];
  return {
    path: new URL(String(input)).pathname,
    headers: new Headers((init as RequestInit | undefined)?.headers),
  };
};

const SESSION_INFO_PATH = '/api/v3.1/auth/session/info';

describe('resolveDeveloperProjectOrDefault', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect('uses the directory project, with no notice and no request, when it is usable', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const { project, notice } = yield* resolveDeveloperProjectOrDefault({});

      expect(project).toMatchObject({ projectId: 'pr_local', source: 'developer-local-config' });
      expect(notice).toEqual(Option.none());
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(
        Layer.mergeAll(singleton, userContext(Option.some('org_1')), localProject('org_1'))
      )
    )
  );

  it.effect(
    'falls back to the default developer project of the logged-in org when the directory has none',
    () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(defaultProjectInfo('org_1'));

        const { project, notice } = yield* resolveDeveloperProjectOrDefault({});

        expect(project).toEqual({
          orgId: 'org_1',
          projectId: 'pr_newest',
          projectName: 'Newest App',
          projectType: 'DEVELOPER',
          source: 'developer-default',
        });
        expect(notice).toEqual(
          Option.some(
            'No developer project is set up for this directory; using "Newest App" (pr_newest), the newest developer project in the org you are logged in to, instead. Run `composio dev init` to choose one, or pass --project-name.'
          )
        );
        // One session-info read, scoped to the stored org so `composio orgs switch` holds.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const request = requestOf(fetchSpy.mock.calls[0]);
        expect(request.path).toBe(SESSION_INFO_PATH);
        expect(request.headers.get('x-org-id')).toBe('org_1');
        expect(request.headers.has('x-project-id')).toBe(false);
      }).pipe(Effect.provide(testLayer))
  );

  it.effect('asks for the key’s default developer project when no org is stored', () =>
    Effect.gen(function* () {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(defaultProjectInfo('org_joined_last'));

      const { project, notice } = yield* resolveDeveloperProjectOrDefault({});

      expect(project).toMatchObject({
        orgId: 'org_joined_last',
        projectId: 'pr_newest',
        source: 'developer-default',
      });
      expect(Option.getOrThrow(notice)).toContain(
        'the newest developer project in the org you joined most recently'
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(requestOf(fetchSpy.mock.calls[0]).headers.has('x-org-id')).toBe(false);
    }).pipe(Effect.provide(Layer.mergeAll(singleton, userContext(Option.none()), noLocalProject)))
  );

  it.effect(
    'ignores a directory project outside the logged-in org and names it in the notice',
    () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(defaultProjectInfo('org_1'));

        const { project, notice } = yield* resolveDeveloperProjectOrDefault({});

        expect(project).toMatchObject({
          orgId: 'org_1',
          projectId: 'pr_newest',
          source: 'developer-default',
        });
        expect(notice).toEqual(
          Option.some(
            'This directory\'s developer project is in org "org_other", not the org you are logged in to ("org_1"); using "Newest App" (pr_newest), the newest developer project in the org you are logged in to, instead. Run `composio orgs switch` to use the directory\'s org, or `composio dev init` to set this directory up in yours.'
          )
        );
        // No request ever names the directory's project.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(requestOf(fetchSpy.mock.calls[0]).headers.get('x-org-id')).toBe('org_1');
      }).pipe(
        Effect.provide(
          Layer.mergeAll(singleton, userContext(Option.some('org_1')), localProject('org_other'))
        )
      )
  );

  it.effect(
    'ignores a directory project in an org the key cannot access when no org is stored',
    () =>
      Effect.gen(function* () {
        const fetchSpy = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce(orgList(['org_mine']))
          .mockResolvedValueOnce(defaultProjectInfo('org_mine'));

        const { project, notice } = yield* resolveDeveloperProjectOrDefault({});

        expect(project).toMatchObject({
          orgId: 'org_mine',
          projectId: 'pr_newest',
          source: 'developer-default',
        });
        expect(notice).toEqual(
          Option.some(
            'This directory\'s developer project is in org "org_2", which your API key cannot access; using "Newest App" (pr_newest), the newest developer project in the org you joined most recently, instead. Run `composio dev init` to set this directory up in one of your orgs.'
          )
        );
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const sessionRequest = requestOf(fetchSpy.mock.calls[1]);
        expect(sessionRequest.path).toBe(SESSION_INFO_PATH);
        expect(sessionRequest.headers.has('x-org-id')).toBe(false);
      }).pipe(
        Effect.provide(Layer.mergeAll(singleton, userContext(Option.none()), localProject('org_2')))
      )
  );

  it.effect.each([
    {
      given: 'session info without a project',
      response: () => jsonResponse({ ...makeSessionInfo(), project: null }),
    },
    {
      given: 'an API error',
      response: () =>
        jsonResponse(
          { error: { slug: 'NotFound', status: 404, code: 404, message: 'No project found.' } },
          404
        ),
    },
  ])(
    '[Given] $given [Then] fails saying no developer project was found, naming `composio dev init`',
    ({ response }) =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());

        const error = yield* resolveDeveloperProjectOrDefault({}).pipe(Effect.flip);

        expect(error).toBeInstanceOf(ProjectResolutionError);
        expect(error).toMatchObject({
          reason: 'missing_developer_project',
          message:
            'No developer project is set up for this directory, and no developer project was found in your org to use instead. Run `composio dev init` to set one up.',
        });
      }).pipe(Effect.provide(testLayer))
  );

  it.effect('names the ignored directory project when no default can be found either', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ ...makeSessionInfo(), project: null })
      );

      const error = yield* resolveDeveloperProjectOrDefault({}).pipe(Effect.flip);

      expect(error).toMatchObject({
        reason: 'missing_developer_project',
        message:
          'This directory\'s developer project is in org "org_other", not the org you are logged in to ("org_1"), and no developer project was found in your org to use instead. Run `composio dev init` to set one up.',
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(singleton, userContext(Option.some('org_1')), localProject('org_other'))
      )
    )
  );

  it.effect('resolves --project-name as before, never falling back', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(projectsPage(['Other']));

      const error = yield* resolveDeveloperProjectOrDefault({ projectName: 'Missing' }).pipe(
        Effect.flip
      );

      expect(error).toMatchObject({ reason: 'project_not_found' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(requestOf(fetchSpy.mock.calls[0]).path).not.toBe(SESSION_INFO_PATH);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect('fails with missing_org before any request when there is no API key', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const error = yield* resolveDeveloperProjectOrDefault({}).pipe(Effect.flip);

      expect(error).toMatchObject({ reason: 'missing_org' });
      expect(fetchSpy).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(
        Layer.mergeAll(singleton, userContext(Option.none(), Option.none()), noLocalProject)
      )
    )
  );
});
