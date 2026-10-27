/**
 * Which command an invocation runs, learned after `effect/cli` parsed argv (see
 * `docs/adr/0001-command-identity-after-parse.md`).
 *
 * A command's identity is its command registration: the command path from the root plus the
 * `CommandMeta` it declares and inherits. `withRegisteredSubcommands`
 * (`src/commands/registration.ts`) gives every registration its identity while the parser's
 * selection is dispatched, and only the selected command calls `CommandInvocation.begin`. `--help`,
 * `--version`, and parse failures have no selected handler; they resolve the identity from the
 * command path `effect/cli` hands them (`identityAt`).
 */
import { Array as Arr, Context, Effect, Option } from 'effect';
import { Command } from 'effect/cli';
import type { TelemetryFamily } from 'src/analytics/types';

/**
 * What a command declares about itself, under one annotation key (`Command.annotate`, or
 * `withCommandMeta` in `src/commands/registration.ts`). Every field is optional; what an
 * absent field means is set once, in `resolveCommandMeta`.
 */
export interface CommandMetaShape {
  /**
   * The family of lifecycle events the command reports (`CLI_EXECUTE_*`, `CLI_LINK_*`, …).
   * Not inherited: a subcommand reports its own family, the generic `command` by default.
   */
  readonly telemetryFamily?: TelemetryFamily;
  /**
   * Whether the command needs a logged-in user (`requireLogin`). Inherited: a group's
   * subcommands need one too.
   */
  readonly requiresLogin?: boolean;
}

export const CommandMeta = Context.Reference<CommandMetaShape>('commands/CommandMeta', {
  defaultValue: () => ({}),
});

/** `CommandMetaShape` with every field decided for one registration. */
export interface ResolvedCommandMeta {
  readonly telemetryFamily: TelemetryFamily;
  readonly requiresLogin: boolean;
}

/** Resolves what a command declares (`own`) under a parent registration's resolved meta. */
export const resolveCommandMeta = (
  parent: ResolvedCommandMeta | undefined,
  own: CommandMetaShape
): ResolvedCommandMeta => ({
  telemetryFamily: own.telemetryFamily ?? 'command',
  requiresLogin: own.requiresLogin ?? parent?.requiresLogin ?? false,
});

/** The meta `command` declares on itself. */
export const commandMetaOf = (command: Command.Command.Any): CommandMetaShape =>
  Context.get(command.annotations, CommandMeta);

/** Adds `meta` to what `self` already declares in its `CommandMeta` annotation. */
export const withCommandMeta =
  (meta: CommandMetaShape) =>
  <const Name extends string, Input, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>
  ): Command.Command<Name, Input, ContextInput, E, R> =>
    Command.annotate(self, CommandMeta, { ...commandMetaOf(self), ...meta });

/** One command registration: where a command sits in the tree and what applies to it there. */
export interface CommandIdentity {
  /** Canonical command names below `composio`; empty for the root command. */
  readonly path: ReadonlyArray<string>;
  readonly meta: ResolvedCommandMeta;
}

/** The root command's identity; the root declares no `CommandMeta`. */
export const ROOT_IDENTITY: CommandIdentity = {
  path: [],
  meta: resolveCommandMeta(undefined, {}),
};

/** The identity of `child` registered under `parent`. */
export const childIdentity = (
  parent: CommandIdentity,
  child: Command.Command.Any
): CommandIdentity => ({
  path: [...parent.path, child.name],
  meta: resolveCommandMeta(parent.meta, commandMetaOf(child)),
});

/** The command path as telemetry records it: the names joined by spaces, `composio` for the root. */
export const commandPathOf = (identity: CommandIdentity): string =>
  identity.path.length === 0 ? 'composio' : identity.path.join(' ');

const subcommandNamed = (command: Command.Command.Any, name: string) =>
  Arr.findFirst(
    command.subcommands.flatMap(group => group.commands),
    child => child.name === name
  );

/**
 * The identity of the registration `effect/cli` names by `commandPath` (canonical names, the root
 * command's name first, as in `CliError.ShowHelp` and `GlobalFlag.HandlerContext`), found by
 * walking `root`'s public subcommands. Stops at the deepest name the tree knows.
 */
export const identityAt = (
  root: Command.Command.Any,
  commandPath: ReadonlyArray<string>
): CommandIdentity => {
  const walk = (
    node: Command.Command.Any,
    identity: CommandIdentity,
    names: ReadonlyArray<string>
  ): CommandIdentity =>
    Arr.matchLeft(names, {
      onEmpty: () => identity,
      onNonEmpty: (name, rest) =>
        Option.match(subcommandNamed(node, name), {
          onNone: () => identity,
          onSome: child => walk(child, childIdentity(identity, child), rest),
        }),
    });
  return walk(root, ROOT_IDENTITY, commandPath.slice(1));
};

/**
 * The identity of the registration whose dispatch is running: provided by every registration to
 * everything below it (`src/commands/registration.ts`), the root's outside any.
 */
export const CommandRegistration = Context.Reference<CommandIdentity>(
  'commands/CommandRegistration',
  { defaultValue: () => ROOT_IDENTITY }
);

/**
 * The invocation's record of the command it runs. `runInvocation` provides it for one
 * invocation; outside one (a test that drives a command directly) it records nothing.
 */
export interface CommandInvocationShape {
  /**
   * Records `identity` as the command this invocation runs, with the input `effect/cli` parsed
   * for it (none for help, version, and parse failures), and reports that it started. Only the
   * first call counts. Never fails.
   */
  readonly begin: (identity: CommandIdentity, input: Option.Option<unknown>) => Effect.Effect<void>;
  /**
   * Notes that the dispatch of the registration `identity` started. Before `begin`, the deepest
   * registration entered is what a failure is reported against: a group-level check that fails
   * before the parser's selection is reached.
   */
  readonly enter: (identity: CommandIdentity) => Effect.Effect<void>;
  /** The run id `begin` minted for `composio run`, shared with its telemetry events. */
  readonly runId: Effect.Effect<Option.Option<string>>;
}

export const CommandInvocation = Context.Reference<CommandInvocationShape>(
  'invocation/CommandInvocation',
  {
    defaultValue: () => ({
      begin: () => Effect.void,
      enter: () => Effect.void,
      runId: Effect.succeedNone,
    }),
  }
);

/** Begins the command `commandPath` names, for an invocation `effect/cli` answers without one. */
export const beginAtCommandPath = (
  root: Command.Command.Any,
  commandPath: ReadonlyArray<string>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const invocation = yield* CommandInvocation;
    yield* invocation.begin(identityAt(root, commandPath), Option.none());
  });

/** The run id of the running `composio run`, if this invocation is one. */
export const invocationRunId: Effect.Effect<Option.Option<string>> = Effect.gen(function* () {
  const invocation = yield* CommandInvocation;
  return yield* invocation.runId;
});
