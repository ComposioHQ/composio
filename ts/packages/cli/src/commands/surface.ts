import { Array as Arr, Context, Data, Effect, Layer, Option, pipe } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { ExpectedFailure } from 'src/effects/expected-failure';
import type { CommandIdentity, SharedFlagName } from 'src/invocation/command-identity';
import {
  resolveCommandProject,
  type ProjectMode,
  type ResolvedCommandProject,
} from 'src/services/command-project';
import { ProjectContext } from 'src/services/project-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';

/** The command tree a command was invoked from. */
export type CommandTree = 'root' | 'dev';

export interface CommandSurfaceShape {
  readonly tree: CommandTree;
  /** `--user-id` of the `dev` group; always none on the root tree. */
  readonly userId: Option.Option<string>;
  /** `--project-name` of the `dev` group; always none on the root tree. */
  readonly projectName: Option.Option<string>;
}

/**
 * What differs between the root tree and the `dev` tree for a command that
 * exists in both: each group provides this service around its subcommands, so
 * one `Command` value serves both and its handler reads the surface instead of
 * taking a `rootOnly` parameter.
 */
export class CommandSurface extends Context.Service<CommandSurface, CommandSurfaceShape>()(
  'commands/CommandSurface'
) {
  static readonly root: Layer.Layer<CommandSurface> = Layer.succeed(
    CommandSurface,
    CommandSurface.of({ tree: 'root', userId: Option.none(), projectName: Option.none() })
  );

  static readonly dev = (flags: {
    readonly userId: Option.Option<string>;
    readonly projectName: Option.Option<string>;
  }): Layer.Layer<CommandSurface> =>
    Layer.succeed(CommandSurface, CommandSurface.of({ tree: 'dev', ...flags }));
}

/**
 * Resolves the command's project for the surface it runs in: the `dev` group's
 * `--project-name` picks the developer project, the root tree never has one.
 */
export const resolveSurfaceProject = (mode: ProjectMode) =>
  Effect.gen(function* () {
    const surface = yield* CommandSurface;
    return yield* resolveCommandProject({
      mode,
      projectName: Option.getOrUndefined(surface.projectName),
    });
  });

// --- acting user ------------------------------------------------------------------------------

/** Which step of the acting-user rule picked the user. */
export type ActingUserSource = 'consumer' | 'flag' | 'directory-test-user' | 'global-test-user';

/**
 * The user a command acts as (glossary "Acting user"), with the project it was resolved
 * against. `actingUserOption` leaves the project optional; see there.
 */
export interface ActingUser<Project = ResolvedCommandProject> {
  readonly userId: string;
  readonly source: ActingUserSource;
  readonly project: Project;
}

/** No step of the acting-user rule found a user for the command. */
export class MissingActingUserError extends Data.TaggedError('commands/MissingActingUserError')<{
  readonly tree: CommandTree;
  readonly projectName: Option.Option<string>;
  readonly message: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

/**
 * The missing-user message for the tree. On the dev tree with `--project-name` the directory's
 * test user does not carry over to another project, so it points at `--user-id` and
 * `composio login` instead of `composio dev init`.
 */
const missingUserMessage = (tree: CommandTree, projectName: Option.Option<string>): string =>
  tree === 'root'
    ? 'Missing consumer user id. Run `composio login` and try again.'
    : Option.match(projectName, {
        onNone: () =>
          'Missing user id. Provide --user-id or run `composio dev init` to set a playground test user id.',
        onSome: () =>
          'Missing user id. Provide --user-id, or run `composio login` to store a global test user id.',
      });

/**
 * The test user the directory configures (`.composio/project.json`), for a command that runs
 * against the directory's project. A `--project-name` that names another project does not
 * borrow it, so the command falls back to the global test user; `namedProjectId` is the id of
 * the project `--project-name` resolved to, or none without the flag.
 */
const directoryTestUserId = (
  directoryProject: Option.Option<{
    readonly projectId: string;
    readonly testUserId: Option.Option<string>;
  }>,
  namedProjectId: Option.Option<string>
): Option.Option<string> =>
  pipe(
    directoryProject,
    Option.filter(
      keys => Option.isNone(namedProjectId) || Option.contains(namedProjectId, keys.projectId)
    ),
    Option.flatMap(keys => keys.testUserId)
  );

/** The dev tree's rule over its candidates: `--user-id`, the directory test user, the global one. */
const devActingUser = (candidates: {
  readonly flag: Option.Option<string>;
  readonly directoryTestUserId: Option.Option<string>;
  readonly globalTestUserId: Option.Option<string>;
}): Option.Option<Omit<ActingUser, 'project'>> =>
  Option.firstSomeOf([
    Option.map(candidates.flag, userId => ({ userId, source: 'flag' as const })),
    Option.map(candidates.directoryTestUserId, userId => ({
      userId,
      source: 'directory-test-user' as const,
    })),
    Option.map(candidates.globalTestUserId, userId => ({
      userId,
      source: 'global-test-user' as const,
    })),
  ]);

const noticeBySource: Record<ActingUserSource, (userId: string) => Option.Option<string>> = {
  consumer: () => Option.none(),
  flag: () => Option.none(),
  'directory-test-user': userId => Option.some(`Using test user id "${userId}"`),
  'global-test-user': userId => Option.some(`Using global test user id "${userId}"`),
};

/** The stderr notice for a test user standing in; none for the consumer user or `--user-id`. */
export const fallbackNotice = (user: Omit<ActingUser, 'project'>): Option.Option<string> =>
  noticeBySource[user.source](user.userId);

/** Prints `fallbackNotice` on stderr when a test user stands in. */
const announceFallback = (user: Option.Option<Omit<ActingUser, 'project'>>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* Effect.transposeOption(
      Option.map(Option.flatMap(user, fallbackNotice), notice => ui.log.warn(notice))
    );
  });

/** The consumer user of a consumer project; an empty id counts as none. */
const consumerUser = (project: ResolvedCommandProject) =>
  pipe(
    Option.fromNullishOr(project.consumerUserId),
    Option.filter(userId => userId.length > 0),
    Option.map(userId => ({ userId, source: 'consumer' as const }))
  );

/** The dev tree's user for a project, `namedProjectId` being the `--project-name` project's id. */
const devUser = (namedProjectId: Option.Option<string>) =>
  Effect.gen(function* () {
    const surface = yield* CommandSurface;
    const userContext = yield* ComposioUserContext;
    const projectContext = yield* ProjectContext;
    const directoryProject = yield* projectContext.resolve.pipe(
      Effect.option,
      Effect.map(Option.flatten)
    );
    return devActingUser({
      flag: surface.userId,
      directoryTestUserId: directoryTestUserId(directoryProject, namedProjectId),
      globalTestUserId: userContext.data.testUserId,
    });
  });

/**
 * The acting user, resolved against the project the command runs in. On the root tree, the
 * consumer user of the consumer project. On the dev tree, against the developer project
 * (`--project-name`, else the directory's): `--user-id`, then the directory test user (only
 * for the directory's own project), then the global test user; a test user standing in is
 * named on stderr (`fallbackNotice`). Fails with
 * `ProjectResolutionError` when the project cannot be resolved and `MissingActingUserError`
 * when no step finds a user.
 */
export const actingUser = () =>
  Effect.gen(function* () {
    const { tree, projectName } = yield* CommandSurface;
    const project = yield* resolveCommandProject(
      tree === 'root'
        ? { mode: 'consumer' }
        : { mode: 'developer', projectName: Option.getOrUndefined(projectName) }
    );
    const user =
      tree === 'root'
        ? consumerUser(project)
        : yield* devUser(Option.as(projectName, project.projectId));
    yield* announceFallback(user);
    if (Option.isNone(user)) {
      return yield* new MissingActingUserError({
        tree,
        projectName,
        message: missingUserMessage(tree, projectName),
      });
    }
    return { ...user.value, project } satisfies ActingUser;
  });

/**
 * The acting user for a command that also runs without one, by the same rule as `actingUser`.
 * On the dev tree it resolves only the project `--project-name` names, so `project` is none when
 * the command runs against the directory's project through the default client; on the root
 * tree it is the consumer project. Names a test user standing in on stderr, as `actingUser`
 * does. Fails only when that project cannot be resolved.
 */
export const actingUserOption = () =>
  Effect.gen(function* () {
    const surface = yield* CommandSurface;
    if (surface.tree === 'root') {
      const project = yield* resolveCommandProject({ mode: 'consumer' });
      return Option.map(
        consumerUser(project),
        (user): ActingUser<Option.Option<ResolvedCommandProject>> => ({
          ...user,
          project: Option.some(project),
        })
      );
    }
    const namedProject = yield* Effect.transposeOption(
      Option.map(surface.projectName, projectName =>
        resolveCommandProject({ mode: 'developer', projectName })
      )
    );
    const user = yield* devUser(Option.map(namedProject, project => project.projectId));
    yield* announceFallback(user);
    return Option.map(user, (found): ActingUser<Option.Option<ResolvedCommandProject>> => ({
      ...found,
      project: namedProject,
    }));
  });

/** A shared flag of the `dev` group. */
export type SharedFlag = '--user-id' | '--project-name';

/**
 * `CommandMeta.sharedFlags` for a `dev` command, or a group, that honors neither shared flag:
 * it cannot target another project and does not act as a user.
 */
export const NO_SHARED_FLAGS = { userId: false, projectName: false } as const;

/** The shared flags, in the order a rejection reports them when several are given. */
const SHARED_FLAGS: ReadonlyArray<{ readonly name: SharedFlagName; readonly flag: SharedFlag }> = [
  { name: 'projectName', flag: '--project-name' },
  { name: 'userId', flag: '--user-id' },
];

const unsupportedSharedFlag = (command: string): Record<SharedFlag, string> => ({
  '--project-name': `\`composio ${command}\` cannot target another project yet. Remove --project-name, or run it from that project's directory.`,
  '--user-id': `\`composio ${command}\` does not act as a user. Remove --user-id.`,
});

/** The first shared flag the surface carries among those `rejects` picks, if any. */
const givenSharedFlag = (rejects: (name: SharedFlagName) => boolean) =>
  Effect.gen(function* () {
    const surface = yield* CommandSurface;
    return Arr.findFirst(SHARED_FLAGS, ({ name }) => rejects(name) && Option.isSome(surface[name]));
  });

/**
 * Fails with a `CommandInputError` when the surface carries either shared flag, with `messages`
 * for its wording: the `dev` group's own `--mode` toggle, which changes a global setting.
 */
export const rejectSharedFlags = (command: string, messages: Record<SharedFlag, string>) =>
  Effect.flatMap(
    givenSharedFlag(() => true),
    Option.match({
      onNone: () => Effect.void,
      onSome: ({ flag }) => Effect.fail(commandInputError(command)(messages[flag], flag)),
    })
  );

/**
 * Fails with a `CommandInputError` when the surface carries a shared flag the selected command
 * cannot honor (`CommandMeta.sharedFlags`), naming the command that ran even when a group above
 * it declared so. Without it the flag would be accepted and ignored. The registration runs it
 * right after the command began (`src/commands/registration.ts`).
 */
export const rejectUnsupportedSharedFlags = (identity: CommandIdentity) =>
  Effect.flatMap(
    givenSharedFlag(name => identity.meta.unsupportedSharedFlags.includes(name)),
    Option.match({
      onNone: () => Effect.void,
      onSome: ({ flag }) => {
        const command = identity.path.join(' ');
        return Effect.fail(commandInputError(command)(unsupportedSharedFlag(command)[flag], flag));
      },
    })
  );
