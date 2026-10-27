import type { ComposioClientShape } from '@composio/client/effect';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import {
  actingUser,
  actingUserOption,
  CommandSurface,
  fallbackNotice,
  MissingActingUserError,
  type ActingUserOptions,
  type ActingUserSource,
  type CommandTree,
} from 'src/commands/surface';
import type { ProjectKeys } from 'src/models/project-keys';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { mockAccountResources } from 'test/__utils__/layers/accounts';
import { makeOrgProject } from 'test/__utils__/models/account';

const ORG_ID = 'org_test';
const CONSUMER_USER_ID = `consumer-user-${ORG_ID}`;
const CONSUMER_PROJECT_ID = 'consumer_project_test';
const DIRECTORY_PROJECT_ID = 'proj_directory';
const OTHER_PROJECT_ID = 'proj_other';

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

const actingUserLayer = (fixture: Fixture) => {
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
  const resources = mockAccountResources({ projects }, {});
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
  R extends CommandSurface | ComposioUserContext | ProjectContext | ComposioClientSingleton,
>(
  effect: Effect.Effect<A, E, R>,
  fixture: Fixture
) => effect.pipe(Effect.provide(actingUserLayer(fixture)));

describe('actingUser', () => {
  it.effect.each(cases)('[Given] $name [Then] acts as the rule’s user', fixture =>
    Effect.gen(function* () {
      const result = yield* run(Effect.result(actingUser()), fixture);
      const expected = expectedUser(fixture);

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

  it.effect('[Given] a command’s own message [Then] fails with it, given --project-name', () =>
    Effect.gen(function* () {
      const error = yield* run(
        Effect.flip(
          actingUser({
            missingUserMessage: name => `No user for ${Option.getOrElse(name, () => 'none')}.`,
          })
        ),
        { tree: 'dev', projectName: 'other', candidates: 'none' }
      );

      expect(error).toMatchObject({ message: 'No user for other.' });
    })
  );

  it.effect.each([
    {
      name: 'the consumer project without --project-name ignores --user-id',
      options: { legacy: { consumerWithoutProjectName: true } },
      fixture: { tree: 'dev', candidates: 'flag', projectName: 'absent' },
      expected: { userId: CONSUMER_USER_ID, source: 'consumer', projectId: CONSUMER_PROJECT_ID },
    },
    {
      name: 'the consumer project still yields to --project-name',
      options: { legacy: { consumerWithoutProjectName: true } },
      fixture: { tree: 'dev', candidates: 'directory', projectName: 'same' },
      expected: {
        userId: 'directory-user',
        source: 'directory-test-user',
        projectId: DIRECTORY_PROJECT_ID,
      },
    },
    {
      name: 'skipping the directory test user falls back to the global one',
      options: { legacy: { skipDirectoryTestUser: true } },
      fixture: { tree: 'dev', candidates: 'directory', projectName: 'same' },
      expected: {
        userId: 'global-user',
        source: 'global-test-user',
        projectId: DIRECTORY_PROJECT_ID,
      },
    },
  ] satisfies ReadonlyArray<{
    name: string;
    options: ActingUserOptions;
    fixture: Fixture;
    expected: { userId: string; source: ActingUserSource; projectId: string };
  }>)('[Given] legacy: $name', ({ options, fixture, expected }) =>
    Effect.gen(function* () {
      const user = yield* run(actingUser(options), fixture);

      expect(user).toMatchObject({
        userId: expected.userId,
        source: expected.source,
        project: { projectId: expected.projectId },
      });
    })
  );
});

// C2: treat an empty consumer user id as missing everywhere
describe('an empty consumer user id', () => {
  const ACCEPT_EMPTY = { legacy: { acceptEmptyConsumerUserId: true } } satisfies ActingUserOptions;
  const sites = [
    { sites: 'execute, search, link, run', options: ACCEPT_EMPTY, tree: 'root', accepted: true },
    {
      sites: 'link on the dev tree without --project-name',
      options: { legacy: { ...ACCEPT_EMPTY.legacy, consumerWithoutProjectName: true } },
      tree: 'dev',
      accepted: true,
    },
    { sites: 'connections list/remove, listen, proxy', options: {}, tree: 'root', accepted: false },
  ] satisfies ReadonlyArray<{
    sites: string;
    options: ActingUserOptions;
    tree: CommandTree;
    accepted: boolean;
  }>;
  const fixture = (tree: CommandTree): Fixture => ({
    tree,
    candidates: 'flag',
    projectName: 'absent',
    consumerUserId: '',
  });

  it.effect.each(sites)(
    '[Given] $sites [Then] actingUser accepts it: $accepted',
    ({ options, tree, accepted }) =>
      Effect.gen(function* () {
        const result = yield* run(Effect.result(actingUser(options)), fixture(tree));

        expect(result).toMatchObject(
          accepted
            ? { success: { userId: '', source: 'consumer' } }
            : { failure: { _tag: 'commands/MissingActingUserError' } }
        );
      })
  );

  it.effect.each(sites)(
    '[Given] $sites [Then] actingUserOption finds it: $accepted',
    ({ options, tree, accepted }) =>
      Effect.gen(function* () {
        const user = yield* run(actingUserOption(options), fixture(tree));

        expect(Option.map(user, ({ userId, source }) => ({ userId, source }))).toEqual(
          accepted ? Option.some({ userId: '', source: 'consumer' }) : Option.none()
        );
      })
  );
});

describe('actingUserOption', () => {
  it.effect.each(cases)('[Given] $name [Then] finds the rule’s user, or none', fixture =>
    Effect.gen(function* () {
      const user = yield* run(actingUserOption(), fixture);
      const expected = expectedUser(fixture);
      // Only the project --project-name names is resolved on the dev tree.
      const project =
        fixture.tree === 'dev' && fixture.projectName === 'absent'
          ? Option.none()
          : Option.some(expectedProjectId(fixture));

      expect(Option.map(user, ({ userId, source }) => ({ userId, source }))).toEqual(expected);
      expect(
        Option.map(user, found => Option.map(found.project, resolved => resolved.projectId))
      ).toEqual(Option.map(expected, () => project));
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
