import { afterEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { APIConnectionError } from '@composio/client/effect';
import { ConfigProvider, Effect, Fiber, Layer, Option } from 'effect';
import { TestClock } from 'effect/testing';
import * as tempy from 'tempy';
import { ProjectResolutionError, resolveCommandProject } from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { makeOrgProject } from 'test/__utils__/models/account';

const BASE_URL = 'https://backend.composio.dev';

const userContext = (orgId: Option.Option<string>) =>
  Layer.succeed(
    ComposioUserContext,
    ComposioUserContext.of({
      data: {
        apiKey: Option.some('uak_test'),
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
