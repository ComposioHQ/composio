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
import { Array as Arr, Context, Effect, Option, Predicate } from 'effect';
import { Command } from 'effect/cli';
import type { TelemetryFamily } from 'src/analytics/types';

/**
 * The hooks the invocation runs for the selected command (`src/invocation/invocation.ts`), in
 * this order, when the command begins: before its invoked event and its login check.
 */
export const INVOCATION_HOOKS = [
  'backendMismatch',
  'updateNotice',
  'pluginHint',
  'backgroundUpdateCheck',
] as const;

export type InvocationHookName = (typeof INVOCATION_HOOKS)[number];

/**
 * Whether a hook runs for a command: always (`true`), never (`false`), or as the input
 * `effect/cli` parsed for the command decides (`composio version --check`).
 */
export type HookPolicy = boolean | ((input: unknown) => boolean);

/** The `dev` group's shared flags (`--user-id`, `--project-name`), by their `CommandSurface` field. */
export type SharedFlagName = 'userId' | 'projectName';

/**
 * What a command declares about itself, under one annotation key (`Command.annotate`, or
 * `withCommandMeta`). Every field is optional; what an absent field means is set once, in
 * `resolveCommandMeta`.
 */
export interface CommandMetaShape {
  /**
   * The family of lifecycle events the command reports (`CLI_EXECUTE_*`, `CLI_LINK_*`, …).
   * Not inherited: a subcommand reports its own family, the generic `command` by default.
   */
  readonly telemetryFamily?: TelemetryFamily;
  /**
   * Whether the command needs a logged-in user. Inherited: a group's subcommands need one too.
   * The selected command checks it right after it began (`src/commands/registration.ts`), so
   * `NotLoggedInError` names the command the user ran.
   */
  readonly requiresLogin?: boolean;
  /**
   * Which invocation hooks run for the command. Every hook runs unless the command, or a group
   * above it, says otherwise; a policy is inherited per hook.
   */
  readonly hooks?: Partial<Readonly<Record<InvocationHookName, HookPolicy>>>;
  /**
   * Which of the `dev` group's shared flags the command can honor. Every one can unless the
   * command, or a group above it, says `false`; inherited per flag. A flag the command cannot
   * honor fails with `CommandInputError` right after the command began, naming the registration
   * that declared it (`src/commands/registration.ts`), instead of being accepted and ignored.
   */
  readonly sharedFlags?: Partial<Readonly<Record<SharedFlagName, boolean>>>;
}

export const CommandMeta = Context.Reference<CommandMetaShape>('commands/CommandMeta', {
  defaultValue: () => ({}),
});

/** `CommandMetaShape` with every field decided for one registration. */
export interface ResolvedCommandMeta {
  readonly telemetryFamily: TelemetryFamily;
  readonly requiresLogin: boolean;
  readonly hooks: Readonly<Record<InvocationHookName, HookPolicy>>;
  /**
   * For each shared flag the command cannot honor, the command path of the registration that
   * declared so: itself, or the group above it whose subcommands inherit it.
   */
  readonly unsupportedSharedFlags: Partial<Readonly<Record<SharedFlagName, ReadonlyArray<string>>>>;
}

const EVERY_HOOK: ResolvedCommandMeta['hooks'] = {
  backendMismatch: true,
  updateNotice: true,
  pluginHint: true,
  backgroundUpdateCheck: true,
};

const SHARED_FLAG_NAMES: ReadonlyArray<SharedFlagName> = ['userId', 'projectName'];

/**
 * Resolves what a command registered at `path` declares (`own`) under a parent registration's
 * resolved meta.
 */
export const resolveCommandMeta = (
  parent: ResolvedCommandMeta | undefined,
  own: CommandMetaShape,
  path: ReadonlyArray<string> = []
): ResolvedCommandMeta => ({
  telemetryFamily: own.telemetryFamily ?? 'command',
  requiresLogin: own.requiresLogin ?? parent?.requiresLogin ?? false,
  hooks: { ...(parent?.hooks ?? EVERY_HOOK), ...own.hooks },
  unsupportedSharedFlags: Object.fromEntries(
    SHARED_FLAG_NAMES.flatMap(flag => {
      const declared = own.sharedFlags?.[flag];
      if (declared === undefined) {
        const inherited = parent?.unsupportedSharedFlags[flag];
        return inherited === undefined ? [] : [[flag, inherited]];
      }
      return declared ? [] : [[flag, path]];
    })
  ),
});

/** Whether `hook` runs for a command with `meta`, given the input `effect/cli` parsed for it. */
export const runsHook = (
  meta: ResolvedCommandMeta,
  hook: InvocationHookName,
  input: unknown
): boolean => {
  const policy = meta.hooks[hook];
  return Predicate.isBoolean(policy) ? policy : policy(input);
};

/** The meta `command` declares on itself. */
export const commandMetaOf = (command: Command.Command.Any): CommandMetaShape =>
  Context.get(command.annotations, CommandMeta);

/**
 * Adds `meta` to what `self` already declares in its `CommandMeta` annotation; a hook policy
 * replaces only that hook's, and a shared-flag declaration only that flag's.
 * `withCommandMeta({ requiresLogin: true })` makes a command, or a group entry and every
 * subcommand under it, require a logged-in user.
 */
export const withCommandMeta =
  (meta: CommandMetaShape) =>
  <const Name extends string, Input, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>
  ): Command.Command<Name, Input, ContextInput, E, R> => {
    const current = commandMetaOf(self);
    return Command.annotate(self, CommandMeta, {
      ...current,
      ...meta,
      hooks: { ...current.hooks, ...meta.hooks },
      sharedFlags: { ...current.sharedFlags, ...meta.sharedFlags },
    });
  };

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
): CommandIdentity => {
  const path = [...parent.path, child.name];
  return { path, meta: resolveCommandMeta(parent.meta, commandMetaOf(child), path) };
};

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
   * for it (none for help, version, and parse failures), and reports that it started; with
   * parsed input, first runs the invocation hooks its `CommandMeta` keeps. Only the first call
   * counts. Never fails.
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
