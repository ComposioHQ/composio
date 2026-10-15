import { Context, Effect, Layer, Option, pipe } from 'effect';
import { Command } from 'effect/cli';
import { commandInputError } from 'src/commands/errors';
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

const unsupportedSharedFlag = (command: string): Record<SharedFlag, string> => ({
  '--project-name': `\`composio ${command}\` cannot target another project yet. Remove --project-name, or run it from that project's directory.`,
  '--user-id': `\`composio ${command}\` does not act as a user. Remove --user-id.`,
});

/**
 * Fails with a `CommandInputError` when the surface carries one of `flags`, for a `dev` command
 * that cannot honor it. Without it the flag would be accepted and ignored. `messages` defaults
 * to the wording for a command that runs against the directory's project.
 */
export const rejectSharedFlags = (
  command: string,
  flags: ReadonlyArray<SharedFlag> = ['--project-name', '--user-id'],
  messages: Record<SharedFlag, string> = unsupportedSharedFlag(command)
) =>
  Effect.gen(function* () {
    const surface = yield* CommandSurface;
    const values: Record<SharedFlag, Option.Option<string>> = {
      '--project-name': surface.projectName,
      '--user-id': surface.userId,
    };
    const given = flags.find(flag => Option.isSome(values[flag]));
    if (given !== undefined) {
      return yield* commandInputError(command)(messages[given], given);
    }
  });

/**
 * Applies `rejectSharedFlags` to a `dev` command, or to a group entry and every subcommand
 * under it. `flags` defaults to both.
 */
export const rejectsSharedFlags =
  (command: string, flags?: ReadonlyArray<SharedFlag>) =>
  <const Name extends string, Input, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>
  ) =>
    Command.provideEffectDiscard(self, rejectSharedFlags(command, flags));
