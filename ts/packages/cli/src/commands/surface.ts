import { Array as Arr, Context, Data, Effect, Layer, Option, pipe } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { ExpectedFailure } from 'src/effects/expected-failure';
import type { CommandIdentity, SharedFlagName } from 'src/invocation/command-identity';
import {
  resolveCommandProject,
  resolveDeveloperProjectOrDefault,
  type ProjectMode,
  type ResolvedCommandProject,
} from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';
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

/**
 * A warning that reaches stderr even off a terminal, where `ui.log.*` decoration is dropped: a
 * script or agent reading stderr must see a fallback that affects the result.
 */
export const warnOnStderr = (message: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    if ((yield* ui.capabilities).canDecorate) {
      yield* ui.log.warn(message);
    } else {
      yield* ui.error(`Warning: ${message}`);
    }
  });

/**
 * The developer project of a dev command that reads or writes the project's resources (auth
 * configs, connected accounts, trigger instances, logs): `--project-name`'s, else the
 * directory's, else the backend's default developer project, named on stderr every time
 * (`resolveDeveloperProjectOrDefault`). These commands once sent no project and let the backend
 * pick that default, so a directory without a usable project of its own keeps working; a command
 * that always required one uses `resolveSurfaceProject('developer')`. Resolved once, so every
 * request of the command names the same project.
 */
export const resolveDeveloperResourceProject = Effect.gen(function* () {
  const { projectName } = yield* CommandSurface;
  const { project, notice } = yield* resolveDeveloperProjectOrDefault({
    projectName: Option.getOrUndefined(projectName),
  });
  yield* Effect.transposeOption(Option.map(notice, warnOnStderr));
  return project;
});

/**
 * The client for the developer project a dev command acts on (`resolveDeveloperResourceProject`),
 * for a command whose requests all read or write that project's resources: they name it rather
 * than leaving the backend to pick the key's default project.
 */
export const developerProjectClient = Effect.gen(function* () {
  const project = yield* resolveDeveloperResourceProject;
  const clientSingleton = yield* ComposioClientSingleton;
  return yield* clientSingleton.getFor({ orgId: project.orgId, projectId: project.projectId });
});

// --- acting user ------------------------------------------------------------------------------

/** Which step of the acting-user rule picked the user. */
export type ActingUserSource = 'consumer' | 'flag' | 'directory-test-user' | 'global-test-user';

/**
 * The user a command acts as (glossary "Acting user"), with the project it was resolved
 * against.
 */
export interface ActingUser {
  readonly userId: string;
  readonly source: ActingUserSource;
  readonly project: ResolvedCommandProject;
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
 * against the directory's project (`projectId`, the project the command resolved). Another
 * project, one `--project-name` names or the default developer project standing in for the
 * directory's, does not borrow it, so the command falls back to the global test user.
 */
const directoryTestUserId = (
  directoryProject: Option.Option<{
    readonly projectId: string;
    readonly testUserId: Option.Option<string>;
  }>,
  projectId: string
): Option.Option<string> =>
  pipe(
    directoryProject,
    Option.filter(keys => keys.projectId === projectId),
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

/** The dev tree's user for the developer project `projectId` the command resolved. */
const devUser = (projectId: string) =>
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
      directoryTestUserId: directoryTestUserId(directoryProject, projectId),
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
    const user = tree === 'root' ? consumerUser(project) : yield* devUser(project.projectId);
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
 * The dev tree's acting user for a command that also runs without one, against the developer
 * project the command resolved (`resolveSurfaceProject('developer')`), by the same rule as
 * `actingUser`: `--user-id`, then the directory test user (only for the directory's own project),
 * then the global test user. Names a test user standing in on stderr, as `actingUser` does; none
 * when no step finds a user.
 */
export const devActingUserOption = (project: ResolvedCommandProject) =>
  Effect.gen(function* () {
    const user = yield* devUser(project.projectId);
    yield* announceFallback(user);
    return Option.map(user, (found): ActingUser => ({ ...found, project }));
  });

/**
 * The developer project and acting user of a dev command whose main work needs neither (it only
 * adds a user's connection status): the user is none when the project is. The backend's default
 * developer project stands in for the directory's (`resolveDeveloperResourceProject`, named on
 * stderr) only when it can serve a user: `--user-id` or the global test user, since the
 * directory's test user belongs to the directory's own project. Without `--project-name`, a
 * project that cannot be resolved, for whatever reason, is none; a `--project-name` that cannot
 * be resolved still fails.
 */
export const resolveSurfaceProjectAndUserOption = Effect.gen(function* () {
  const surface = yield* CommandSurface;
  const userContext = yield* ComposioUserContext;
  const userBeyondDirectory = Option.orElse(surface.userId, () => userContext.data.testUserId);
  const resolved = (
    Option.isSome(userBeyondDirectory)
      ? resolveDeveloperResourceProject
      : resolveSurfaceProject('developer')
  ).pipe(Effect.map(Option.some));
  const project = yield* Option.isSome(surface.projectName)
    ? resolved
    : resolved.pipe(
        Effect.catch(error =>
          Effect.logDebug('No developer project for connection status:', error).pipe(
            Effect.as(Option.none<ResolvedCommandProject>())
          )
        )
      );
  const user = yield* Effect.map(
    Effect.transposeOption(Option.map(project, devActingUserOption)),
    Option.flatten
  );
  return { project, user };
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
