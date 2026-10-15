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

/**
 * Makes a `dev` command, or a group entry and every subcommand under it, fail with a
 * `CommandInputError` when the `dev` group's `--project-name` is given, for commands that
 * cannot target another project yet. Without it the flag would be accepted and ignored.
 */
export const rejectsProjectName =
  (command: string) =>
  <const Name extends string, Input, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>
  ) =>
    Command.provideEffectDiscard(
      self,
      Effect.gen(function* () {
        const surface = yield* CommandSurface;
        if (Option.isSome(surface.projectName)) {
          return yield* commandInputError(command)(
            `\`composio ${command}\` does not support --project-name yet; run it from a directory configured for that project.`,
            '--project-name'
          );
        }
      })
    );
