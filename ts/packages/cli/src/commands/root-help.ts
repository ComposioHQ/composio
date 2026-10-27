import { Console, Context, Effect } from 'effect';
import { CliConfig, CliOutput, Command, GlobalFlag } from 'effect/cli';
import type { NotLoggedInError } from 'src/commands/errors';
import { beginAtCommandPath } from 'src/invocation/command-identity';
import type { ComposioUserContext } from 'src/services/user-context';
import { withRegisteredSubcommands } from 'src/commands/registration';

export const RootHelpMarker = Context.Reference<boolean>('commands/RootHelpMarker', {
  defaultValue: () => false,
});

export class RootHelpContext extends Context.Service<
  RootHelpContext,
  {
    readonly command: Command.Command.Any;
    readonly version: string;
  }
>()('commands/RootHelpContext') {}

/** Keep a short root overview; the framework generates every usage, flag, and subcommand. */
export const helpFormatter = () => {
  const formatter = CliOutput.defaultFormatter();
  return {
    ...formatter,
    formatVersion: (_name: string, version: string) => version,
    formatHelpDoc: (doc: Parameters<typeof formatter.formatHelpDoc>[0]) => {
      const text = formatter.formatHelpDoc(doc);
      return Context.get(doc.annotations, RootHelpMarker)
        ? `${text}\n\nUse \`composio <command> --help\` for command details.\nDocumentation: https://docs.composio.dev`
        : text;
    },
  } satisfies CliOutput.Formatter;
};

export const showCommandHelp = (parts: ReadonlyArray<string> = []) =>
  Effect.gen(function* () {
    const { command, version } = yield* RootHelpContext;
    const { builtIns } = yield* CliConfig.CliConfig;
    const console = yield* Console.Console;
    yield* GlobalFlag.Help.run(true, {
      command,
      commandPath: [command.name, ...parts],
      version,
      builtIns,
    }).pipe(
      Effect.provideService(Console.Console, {
        ...console,
        log: (...args) => console.info(...args),
      })
    );
  });

/** Derive help aliases from the real command tree, letting Effect validate names and suggest fixes. */
export const buildHelpCommand = (commands: ReadonlyArray<Command.Command.Any>) => {
  const makeHelpCommand = (
    name: string,
    path: ReadonlyArray<string>,
    subcommands: ReadonlyArray<Command.Command.Any>,
    description: string | undefined
  ): Command.Command<
    string,
    Record<never, never>,
    Record<never, never>,
    NotLoggedInError,
    RootHelpContext | ComposioUserContext
  > =>
    Command.make(name, {}, () => showCommandHelp(path)).pipe(
      Command.withDescription(description ?? 'Show command help.'),
      withRegisteredSubcommands(
        subcommands.map(child => {
          const help = makeHelpCommand(
            child.name,
            [...path, child.name],
            child.subcommands.flatMap(group => group.commands),
            child.description
          );
          const aliased = child.alias ? help.pipe(Command.withAlias(child.alias)) : help;
          return child.unlisted ? aliased.pipe(Command.unlisted) : aliased;
        })
      )
    );
  return makeHelpCommand('help', [], commands, 'Show help for a command.');
};

/**
 * `--help`: begins the command whose help it shows (no handler runs, so nothing else records
 * it). A help flag on the help alias describes the requested command.
 */
export const Help = GlobalFlag.Action({
  flag: GlobalFlag.Help.flag,
  run: (value, context) =>
    beginAtCommandPath(context.command, context.commandPath).pipe(
      Effect.andThen(
        GlobalFlag.Help.run(value, {
          ...context,
          commandPath:
            context.commandPath[1] === 'help'
              ? [context.commandPath[0], ...context.commandPath.slice(2)]
              : context.commandPath,
        })
      )
    ),
});

/** `--version`: begins the command it was given on (no handler runs), then prints the version. */
export const Version = GlobalFlag.Action({
  flag: GlobalFlag.Version.flag,
  run: (value, context) =>
    beginAtCommandPath(context.command, context.commandPath).pipe(
      Effect.andThen(GlobalFlag.Version.run(value, context))
    ),
});
