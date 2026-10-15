import { Context, Effect, Layer, Option } from 'effect';
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
 * The client for the developer project the `dev` group's `--project-name` names, or none when
 * the flag is absent and the command keeps its default client.
 */
export const namedProjectClient = Effect.gen(function* () {
  const surface = yield* CommandSurface;
  if (Option.isNone(surface.projectName)) {
    return Option.none();
  }
  const project = yield* resolveSurfaceProject('developer');
  const clientSingleton = yield* ComposioClientSingleton;
  return Option.some(
    yield* clientSingleton.getFor({ orgId: project.orgId, projectId: project.projectId })
  );
});

/** A shared flag of the `dev` group. */
export type SharedFlag = '--user-id' | '--project-name';

const unsupportedSharedFlag = (command: string): Record<SharedFlag, string> => ({
  '--project-name': `\`composio ${command}\` does not support --project-name yet; run it from a directory configured for that project.`,
  '--user-id': `\`composio ${command}\` does not act for a user and does not take --user-id.`,
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
