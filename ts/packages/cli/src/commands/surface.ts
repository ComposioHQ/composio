import { Array as Arr, Context, Effect, Layer, Option, pipe } from 'effect';
import { commandInputError } from 'src/commands/errors';
import type { CommandIdentity, SharedFlagName } from 'src/invocation/command-identity';
import { resolveCommandProject, type ProjectMode } from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';

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
 * The developer project the `dev` group's `--project-name` names, with its client, or none when
 * the flag is absent and the command keeps the directory's project and its default client.
 */
export const namedProject = Effect.gen(function* () {
  const surface = yield* CommandSurface;
  if (Option.isNone(surface.projectName)) {
    return Option.none();
  }
  const project = yield* resolveSurfaceProject('developer');
  const clientSingleton = yield* ComposioClientSingleton;
  const client = yield* clientSingleton.getFor({
    orgId: project.orgId,
    projectId: project.projectId,
  });
  return Option.some({ projectId: project.projectId, client });
});

/**
 * The test user the directory configures (`.composio/project.json`), for a command that runs
 * against the directory's project. A `--project-name` that names another project does not
 * borrow it, so the command falls back to the global test user; `namedProjectId` is the id of
 * the project `--project-name` resolved to, or none without the flag.
 */
export const directoryTestUserId = (
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

/**
 * The missing-user message for a command, given its `--project-name`. With the flag the
 * directory's test user does not carry over to another project, so the message points at
 * `--user-id` and `composio login` instead of `composio dev init`.
 */
export const missingUserIdMessage = (projectName: Option.Option<string>, otherwise: string) =>
  Option.match(projectName, {
    onNone: () => otherwise,
    onSome: () =>
      'Missing user id. Provide --user-id, or run `composio login` to store a global test user id.',
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
