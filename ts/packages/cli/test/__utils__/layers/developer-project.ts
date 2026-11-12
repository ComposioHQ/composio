import { expect } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Option } from 'effect';
import { CommandSurface } from 'src/commands/surface';
import { ProjectResolutionError } from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { cliExit } from 'test/__utils__/cli';
import { makeOrgProject } from 'test/__utils__/models/account';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import { recordRepositoryScopes } from 'test/__utils__/services/toolkits-repository-stub';

/**
 * The developer project the `global-test-user-id` fixture's directory is set up for
 * (`.composio/project.json`), as the org and project a request is scoped to.
 */
export const DIRECTORY_PROJECT_SCOPE = { orgId: 'org_test', projectId: 'proj_test' } as const;

/** Another developer project in the same org, which `--project-name` names. */
export const OTHER_DEVELOPER_PROJECT = makeOrgProject({
  id: 'proj_other',
  name: 'other-project',
  orgId: 'org_test',
});

export const OTHER_PROJECT_SCOPE = {
  orgId: 'org_test',
  projectId: OTHER_DEVELOPER_PROJECT.id,
} as const;

/**
 * `TestLive` input for a logged-in user (org `org_test`, global test user `global-default`)
 * working in a directory set up for {@link DIRECTORY_PROJECT_SCOPE}, whose org also holds
 * {@link OTHER_DEVELOPER_PROJECT}.
 */
export const inDeveloperProjectDirectory = {
  fixture: 'global-test-user-id',
  accountData: { projects: [OTHER_DEVELOPER_PROJECT] },
} as const satisfies TestLiveInput;

/** What a dev command that acts on a project says when the directory names none. */
export const NO_DEVELOPER_PROJECT_MESSAGE =
  'No developer project configured for this directory. Run `composio dev init`.';

/**
 * Runs the CLI with `args` while the repository records the scope of every project resource
 * call, and returns how the run ended with those calls.
 */
export const runRecordingRepositoryScopes = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const recorder = recordRepositoryScopes();
    const result = yield* cliExit(args).pipe(Effect.provide(recorder.layer));
    return { ...result, calls: recorder.calls };
  });

/** Logs in to `org_test` without setting the working directory up for any project. */
export const loginWithoutDeveloperProject = Effect.gen(function* () {
  const userContext = yield* ComposioUserContext;
  yield* userContext.login('test_api_key', 'org_test');
});

/** Asserts that a run failed because the directory is set up for no developer project. */
export const expectNoDeveloperProject = (exit: Exit.Exit<unknown, unknown>) => {
  const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
  expect(error).toBeInstanceOf(ProjectResolutionError);
  expect(error).toMatchObject({ message: NO_DEVELOPER_PROJECT_MESSAGE });
};

/**
 * What `resolveSurfaceProject('developer')` reads in a handler test, without argv or `TestLive`:
 * the dev tree with no shared flags, a user logged in to `org_test`, and a working directory set
 * up for {@link DIRECTORY_PROJECT_SCOPE}. Resolving that project sends no request, so the
 * client singleton dies when asked for a client.
 */
export const DirectoryProjectTest = Layer.mergeAll(
  CommandSurface.dev({ userId: Option.none(), projectName: Option.none() }),
  Layer.succeed(
    ComposioUserContext,
    ComposioUserContext.of({
      data: {
        apiKey: Option.some('uak_test'),
        baseURL: 'https://mock.invalid',
        webURL: 'https://platform.mock.invalid',
        orgId: Option.some(DIRECTORY_PROJECT_SCOPE.orgId),
        projectId: Option.none(),
        testUserId: Option.none(),
      },
      backendMismatch: Option.none(),
      isLoggedIn: () => true,
      logout: Effect.void,
      login: () => Effect.void,
      update: () => Effect.void,
    })
  ),
  Layer.succeed(
    ProjectContext,
    ProjectContext.of({
      resolve: Effect.succeedSome({
        orgId: DIRECTORY_PROJECT_SCOPE.orgId,
        projectId: DIRECTORY_PROJECT_SCOPE.projectId,
        projectName: Option.some('Developer Project'),
        orgName: Option.none(),
        email: Option.none(),
        testUserId: Option.none(),
      }),
    })
  ),
  Layer.succeed(
    ComposioClientSingleton,
    ComposioClientSingleton.of({
      get: () => Effect.die('the client singleton is not used in this test'),
      getFor: () => Effect.die('the client singleton is not used in this test'),
      getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
    })
  )
);
