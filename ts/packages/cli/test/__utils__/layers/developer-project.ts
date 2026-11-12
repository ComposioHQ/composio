import { Effect, Layer, Option } from 'effect';
import { CommandSurface } from 'src/commands/surface';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import type { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { cliExit } from 'test/__utils__/cli';
import type { MockAccountRequest, MockRequestScope } from 'test/__utils__/layers/accounts';
import { makeOrgProject, makeSessionInfo } from 'test/__utils__/models/account';
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

/**
 * The developer project the backend acts on for a request that names none, as session info
 * reports it for `org_test`: the newest developer project of that org.
 */
export const DEFAULT_PROJECT_SCOPE = { orgId: 'org_test', projectId: 'proj_newest' } as const;

/**
 * `TestLive` account data whose session info reports {@link DEFAULT_PROJECT_SCOPE}'s project in the
 * org the request names (`org_test` when it names none), recording every account request in
 * `requests`.
 */
export const defaultDeveloperProjectAccountData = (requests: Array<MockAccountRequest> = []) => ({
  // The org the request names (`x-org-id`), else `org_test`.
  sessionInfo: (scope: MockRequestScope) =>
    makeSessionInfo({
      orgId: scope.orgId ?? DEFAULT_PROJECT_SCOPE.orgId,
      projectNanoId: DEFAULT_PROJECT_SCOPE.projectId,
      projectName: 'newest-project',
    }),
  onRequest: (request: MockAccountRequest) => {
    requests.push(request);
  },
});

/**
 * What a dev command that acts on a project's resources says on stderr, off a terminal, when it
 * uses {@link DEFAULT_PROJECT_SCOPE} because the directory is set up for no project.
 */
export const NO_DIRECTORY_PROJECT_NOTICE =
  'Warning: No developer project is set up for this directory; using "newest-project" (proj_newest), the newest developer project in the org you are logged in to, instead. Run `composio dev init` to choose one, or pass --project-name.';

/**
 * Runs the CLI with `args` while the repository records the scope of every project resource
 * call, and returns how the run ended with those calls. `layer` replaces more of the test layer,
 * such as the terminal.
 */
export const runRecordingRepositoryScopes = (
  args: ReadonlyArray<string>,
  layer: Layer.Layer<TerminalUI> | undefined = undefined
) =>
  Effect.gen(function* () {
    const recorder = recordRepositoryScopes();
    const result = yield* cliExit(args).pipe(
      Effect.provide(recorder.layer),
      Effect.provide(layer ?? Layer.empty)
    );
    return { ...result, calls: recorder.calls };
  });

/** Logs in to `org_test` without setting the working directory up for any project. */
export const loginWithoutDeveloperProject = Effect.gen(function* () {
  const userContext = yield* ComposioUserContext;
  yield* userContext.login('test_api_key', 'org_test');
});

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
