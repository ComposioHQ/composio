import type { ComposioClientShape } from '@composio/client/effect';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import {
  actingUser,
  CommandSurface,
  devActingUserOption,
  fallbackNotice,
  MissingActingUserError,
  resolveSurfaceProject,
  resolveDeveloperResourceProject,
  resolveSurfaceProjectAndUserOption,
  type ActingUserSource,
  type CommandTree,
} from 'src/commands/surface';
import type { ProjectKeys } from 'src/models/project-keys';
import { ProjectResolutionError } from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { mockAccountResources } from 'test/__utils__/layers/accounts';
import { makeOrgProject, makeSessionInfo } from 'test/__utils__/models/account';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const ORG_ID = 'org_test';
const CONSUMER_USER_ID = `consumer-user-${ORG_ID}`;
const CONSUMER_PROJECT_ID = 'consumer_project_test';
const DIRECTORY_PROJECT_ID = 'proj_directory';
const OTHER_PROJECT_ID = 'proj_other';
/** The developer project the backend acts on for a request that names none. */
const DEFAULT_PROJECT_ID = 'proj_newest';

const projects = [
  makeOrgProject({ id: DIRECTORY_PROJECT_ID, name: 'directory', orgId: ORG_ID }),
  makeOrgProject({ id: OTHER_PROJECT_ID, name: 'other', orgId: ORG_ID }),
];

/** The candidates present, named after the one the dev tree's rule picks first. */
type Candidates = 'flag' | 'directory' | 'global' | 'none';
/** `--project-name`: absent, the directory's own project, or another one. */
type ProjectName = 'absent' | 'same' | 'other';

interface Fixture {
  readonly tree: CommandTree;
  readonly candidates: Candidates;
  readonly projectName: ProjectName;
  /** The consumer user id the consumer project resolves with. */
  readonly consumerUserId?: string;
}

const CANDIDATE_ORDER: ReadonlyArray<Candidates> = ['flag', 'directory', 'global', 'none'];

const PROJECT_NAMES: Record<ProjectName, Option.Option<string>> = {
  absent: Option.none(),
  same: Option.some('directory'),
  other: Option.some('other'),
};

/** `warnings` collects what the code under test warns on stderr. */
const actingUserLayer = (fixture: Fixture, warnings: Array<string>) => {
  const has = (candidate: Exclude<Candidates, 'none'>) =>
    CANDIDATE_ORDER.indexOf(candidate) >= CANDIDATE_ORDER.indexOf(fixture.candidates);
  const directory: ProjectKeys = {
    orgId: ORG_ID,
    projectId: DIRECTORY_PROJECT_ID,
    projectName: Option.some('directory'),
    orgName: Option.none(),
    email: Option.none(),
    testUserId: has('directory') ? Option.some('directory-user') : Option.none(),
  };
  const resources = mockAccountResources(
    {
      projects,
      sessionInfo: makeSessionInfo({
        orgId: ORG_ID,
        projectNanoId: DEFAULT_PROJECT_ID,
        projectName: 'newest',
      }),
    },
    {}
  );
  // The account resources answer only the fields `resolveCommandProject` reads.
  const client = {
    ...resources,
    _internal: {
      org: {
        consumer: {
          ...resources._internal.org.consumer,
          project: {
            resolve: (
              ...args: Parameters<typeof resources._internal.org.consumer.project.resolve>
            ) =>
              resources._internal.org.consumer.project.resolve(...args).pipe(
                Effect.map(project => ({
                  ...project,
                  consumer_user_id: fixture.consumerUserId ?? project.consumer_user_id,
                }))
              ),
          },
        },
      },
    },
  } as unknown as ComposioClientShape;

  return Layer.mergeAll(
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
        log: {
          ...terminalUITestImpl.log,
          warn: message => Effect.sync(() => warnings.push(message)),
        },
        // Off a terminal a warning that must still show is a plain stderr line.
        error: message => Effect.sync(() => warnings.push(message)),
      })
    ),
    Layer.succeed(
      CommandSurface,
      CommandSurface.of({
        tree: fixture.tree,
        userId: has('flag') ? Option.some('flag-user') : Option.none(),
        projectName: PROJECT_NAMES[fixture.projectName],
      })
    ),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey: Option.some('uak_test'),
          baseURL: 'https://mock.invalid',
          webURL: 'https://platform.mock.invalid',
          orgId: Option.some(ORG_ID),
          projectId: Option.none(),
          testUserId: has('global') ? Option.some('global-user') : Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => true,
        logout: Effect.void,
        login: () => Effect.void,
        update: () => Effect.void,
      })
    ),
    Layer.succeed(ProjectContext, ProjectContext.of({ resolve: Effect.succeedSome(directory) })),
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(client),
        getFor: () => Effect.succeed(client),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    )
  );
};

/** The acting user the glossary's rule names, or none when it names no one. */
const expectedUser = ({
  tree,
  candidates,
  projectName,
}: Fixture): Option.Option<{ readonly userId: string; readonly source: ActingUserSource }> => {
  if (tree === 'root') {
    return Option.some({ userId: CONSUMER_USER_ID, source: 'consumer' });
  }
  if (candidates === 'flag') {
    return Option.some({ userId: 'flag-user', source: 'flag' });
  }
  // The directory test user stands in only for the directory's own project.
  if (candidates === 'directory' && projectName !== 'other') {
    return Option.some({ userId: 'directory-user', source: 'directory-test-user' });
  }
  return candidates === 'none'
    ? Option.none()
    : Option.some({ userId: 'global-user', source: 'global-test-user' });
};

/** The id of the project the user is resolved against. */
const expectedProjectId = ({ tree, projectName }: Fixture) =>
  tree === 'root'
    ? CONSUMER_PROJECT_ID
    : projectName === 'other'
      ? OTHER_PROJECT_ID
      : DIRECTORY_PROJECT_ID;

const TREES: ReadonlyArray<CommandTree> = ['root', 'dev'];
const PROJECT_NAME_CASES: ReadonlyArray<ProjectName> = ['absent', 'same', 'other'];

// Every combination of the three axes.
const cases = TREES.flatMap(tree =>
  CANDIDATE_ORDER.flatMap(candidates =>
    PROJECT_NAME_CASES.map(projectName => ({
      tree,
      candidates,
      projectName,
      name: `${tree}, ${candidates} first, --project-name ${projectName}`,
    }))
  )
);

const run = <
  A,
  E,
  R extends
    CommandSurface | ComposioUserContext | ProjectContext | ComposioClientSingleton | TerminalUI,
>(
  effect: Effect.Effect<A, E, R>,
  fixture: Fixture,
  warnings: Array<string> = []
) => effect.pipe(Effect.provide(actingUserLayer(fixture, warnings)));

/** The notice printed for the rule's user: one line for a test user standing in, else none. */
const expectedNotices = (fixture: Fixture) =>
  Option.toArray(Option.flatMap(expectedUser(fixture), fallbackNotice));

describe('actingUser', () => {
  it.effect.each(cases)('[Given] $name [Then] acts as the rule’s user', fixture =>
    Effect.gen(function* () {
      const warnings: Array<string> = [];
      const result = yield* run(Effect.result(actingUser()), fixture, warnings);
      const expected = expectedUser(fixture);

      expect(warnings).toEqual(expectedNotices(fixture));

      if (Option.isNone(expected)) {
        expect(result).toMatchObject({ failure: { _tag: 'commands/MissingActingUserError' } });
        return;
      }
      expect(result).toMatchObject({
        success: { ...expected.value, project: { projectId: expectedProjectId(fixture) } },
      });
    })
  );

  it.effect.each([
    {
      tree: 'root',
      projectName: 'absent',
      message: 'Missing consumer user id. Run `composio login` and try again.',
    },
    {
      tree: 'dev',
      projectName: 'absent',
      message:
        'Missing user id. Provide --user-id or run `composio dev init` to set a playground test user id.',
    },
    {
      tree: 'dev',
      projectName: 'other',
      message:
        'Missing user id. Provide --user-id, or run `composio login` to store a global test user id.',
    },
  ] as const)(
    '[Given] no user on the $tree tree, --project-name $projectName [Then] fails with the tree’s message',
    ({ tree, projectName, message }) =>
      Effect.gen(function* () {
        const error = yield* run(Effect.flip(actingUser()), {
          tree,
          projectName,
          candidates: 'none',
          consumerUserId: '',
        });

        expect(error).toBeInstanceOf(MissingActingUserError);
        expect(error).toMatchObject({ tree, projectName: PROJECT_NAMES[projectName], message });
      })
  );
});

// `execute`, `search`, `link` and `run` used to accept an empty consumer user id as the user.
describe('an empty consumer user id', () => {
  const fixture: Fixture = {
    tree: 'root',
    candidates: 'flag',
    projectName: 'absent',
    consumerUserId: '',
  };

  it.effect('[Given] an empty consumer user id [Then] actingUser fails as missing', () =>
    Effect.gen(function* () {
      const error = yield* run(Effect.flip(actingUser()), fixture);

      expect(error).toBeInstanceOf(MissingActingUserError);
    })
  );
});

describe('devActingUserOption', () => {
  it.effect.each(cases.filter(({ tree }) => tree === 'dev'))(
    '[Given] $name [Then] finds the rule’s user for the resolved project, or none',
    fixture =>
      Effect.gen(function* () {
        const warnings: Array<string> = [];
        const user = yield* run(
          Effect.flatMap(resolveSurfaceProject('developer'), devActingUserOption),
          fixture,
          warnings
        );
        const expected = expectedUser(fixture);

        expect(warnings).toEqual(expectedNotices(fixture));
        expect(Option.map(user, ({ userId, source }) => ({ userId, source }))).toEqual(expected);
        expect(Option.map(user, found => found.project.projectId)).toEqual(
          Option.map(expected, () => expectedProjectId(fixture))
        );
      })
  );
});

const withoutDirectoryProject = Layer.succeed(
  ProjectContext,
  ProjectContext.of({ resolve: Effect.succeedNone })
);

/** A directory set up, by someone else, for a project in an org the user is not logged in to. */
const directoryProjectElsewhere = Layer.succeed(
  ProjectContext,
  ProjectContext.of({
    resolve: Effect.succeedSome({
      orgId: 'org_elsewhere',
      projectId: 'proj_elsewhere',
      projectName: Option.some('elsewhere'),
      orgName: Option.none(),
      email: Option.none(),
      testUserId: Option.some('elsewhere-user'),
    }),
  })
);

const NO_DIRECTORY_PROJECT_NOTICE =
  'Warning: No developer project is set up for this directory; using "newest" (proj_newest), the newest developer project in the org you are logged in to, instead. Run `composio dev init` to choose one, or pass --project-name.';

const DIRECTORY_PROJECT_ELSEWHERE_NOTICE =
  'Warning: This directory\'s developer project is in org "org_elsewhere", not the org you are logged in to ("org_test"); using "newest" (proj_newest), the newest developer project in the org you are logged in to, instead. Run `composio orgs switch` to use the directory\'s org, or `composio dev init` to set this directory up in yours.';

describe('resolveDeveloperResourceProject', () => {
  it.effect.each([
    { projectName: 'absent', expected: DIRECTORY_PROJECT_ID },
    { projectName: 'other', expected: OTHER_PROJECT_ID },
  ] as const)(
    '[Given] --project-name $projectName [Then] resolves that project with no notice',
    ({ projectName, expected }) =>
      Effect.gen(function* () {
        const warnings: Array<string> = [];
        const project = yield* run(
          resolveDeveloperResourceProject,
          { tree: 'dev', candidates: 'none', projectName },
          warnings
        );

        expect(project.projectId).toBe(expected);
        expect(warnings).toEqual([]);
      })
  );

  it.effect.each([
    {
      given: 'no directory project',
      layer: withoutDirectoryProject,
      notice: NO_DIRECTORY_PROJECT_NOTICE,
    },
    {
      given: 'a directory project in another org',
      layer: directoryProjectElsewhere,
      notice: DIRECTORY_PROJECT_ELSEWHERE_NOTICE,
    },
  ])(
    '[Given] $given [Then] uses the default developer project and says so on stderr',
    ({ layer, notice }) =>
      Effect.gen(function* () {
        const warnings: Array<string> = [];
        const project = yield* run(
          resolveDeveloperResourceProject.pipe(Effect.provide(layer)),
          { tree: 'dev', candidates: 'none', projectName: 'absent' },
          warnings
        );

        expect(project).toMatchObject({
          orgId: ORG_ID,
          projectId: DEFAULT_PROJECT_ID,
          source: 'developer-default',
        });
        expect(warnings).toEqual([notice]);
      })
  );

  it.effect('[Given] a --project-name the org does not hold [Then] fails', () =>
    Effect.gen(function* () {
      const error = yield* run(
        Effect.flip(
          resolveDeveloperResourceProject.pipe(
            Effect.provide(
              CommandSurface.dev({ userId: Option.none(), projectName: Option.some('missing') })
            )
          )
        ),
        { tree: 'dev', candidates: 'none', projectName: 'absent' }
      );

      expect(error).toBeInstanceOf(ProjectResolutionError);
      expect(error).toMatchObject({ reason: 'project_not_found' });
    })
  );

  it.effect(
    '[Given] the default project stands in for another org’s directory project [Then] its test user does not',
    () =>
      Effect.gen(function* () {
        const warnings: Array<string> = [];
        const user = yield* run(
          Effect.flatMap(resolveDeveloperResourceProject, devActingUserOption).pipe(
            Effect.provide(directoryProjectElsewhere)
          ),
          { tree: 'dev', candidates: 'global', projectName: 'absent' },
          warnings
        );

        expect(Option.map(user, ({ userId, source }) => ({ userId, source }))).toEqual(
          Option.some({ userId: 'global-user', source: 'global-test-user' })
        );
      })
  );
});

describe('resolveSurfaceProjectAndUserOption', () => {
  it.effect('[Given] a directory project and its test user [Then] finds both', () =>
    Effect.gen(function* () {
      const { project, user } = yield* run(resolveSurfaceProjectAndUserOption, {
        tree: 'dev',
        candidates: 'directory',
        projectName: 'absent',
      });

      expect(Option.map(project, found => found.projectId)).toEqual(
        Option.some(DIRECTORY_PROJECT_ID)
      );
      expect(Option.map(user, ({ userId, source }) => ({ userId, source }))).toEqual(
        Option.some({ userId: 'directory-user', source: 'directory-test-user' })
      );
    })
  );

  it.effect.each([
    { candidates: 'flag', userId: 'flag-user' },
    { candidates: 'global', userId: 'global-user' },
  ] as const)(
    '[Given] no directory project and a $candidates user [Then] uses the default project, saying so',
    ({ candidates, userId }) =>
      Effect.gen(function* () {
        const warnings: Array<string> = [];
        const { project, user } = yield* run(
          resolveSurfaceProjectAndUserOption.pipe(Effect.provide(withoutDirectoryProject)),
          { tree: 'dev', candidates, projectName: 'absent' },
          warnings
        );

        expect(Option.map(project, found => found.projectId)).toEqual(
          Option.some(DEFAULT_PROJECT_ID)
        );
        expect(Option.map(user, found => found.userId)).toEqual(Option.some(userId));
        expect(warnings[0]).toBe(NO_DIRECTORY_PROJECT_NOTICE);
      })
  );

  it.effect.each([
    { given: 'no directory project', layer: withoutDirectoryProject },
    { given: 'a directory project in another org', layer: directoryProjectElsewhere },
  ])('[Given] $given and no user but the directory’s [Then] finds neither, quietly', ({ layer }) =>
    Effect.gen(function* () {
      const warnings: Array<string> = [];
      const result = yield* run(
        resolveSurfaceProjectAndUserOption.pipe(Effect.provide(layer)),
        { tree: 'dev', candidates: 'none', projectName: 'absent' },
        warnings
      );

      expect(result).toEqual({ project: Option.none(), user: Option.none() });
      expect(warnings).toEqual([]);
    })
  );
});

describe('fallbackNotice', () => {
  it.each([
    { source: 'consumer', expected: Option.none() },
    { source: 'flag', expected: Option.none() },
    { source: 'directory-test-user', expected: Option.some('Using test user id "u"') },
    { source: 'global-test-user', expected: Option.some('Using global test user id "u"') },
  ] as const)(
    '[Given] a $source user [Then] announces only a test user',
    ({ source, expected }) => {
      expect(fallbackNotice({ userId: 'u', source })).toEqual(expected);
    }
  );
});
