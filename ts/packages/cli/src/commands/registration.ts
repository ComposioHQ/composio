/**
 * Command registrations: how a group gives each subcommand its identity (command path and
 * `CommandMeta`) and how the command the parser selected records it. See
 * `src/invocation/command-identity.ts` and `docs/adr/0001-command-identity-after-parse.md`.
 *
 * `effect/cli` runs a selected command's handler inside every provider of the groups above it,
 * outermost first, and runs a group's own handler only when no subcommand was selected (pinned by
 * `test/src/commands/registration.test.ts`). So each registration provides its identity around
 * its whole dispatch, and `CommandInvocation.begin` wraps only handlers: a leaf's when its group
 * registers it, a group's own one when the group registers its subcommands.
 */
import { Effect, Option } from 'effect';
import { Command } from 'effect/cli';
import type { CommandInputError, NotLoggedInError } from 'src/commands/errors';
import { type CommandSurface, rejectUnsupportedSharedFlags } from 'src/commands/surface';
import { assertLoggedIn } from 'src/effects/require-auth';
import {
  childIdentity,
  CommandInvocation,
  CommandRegistration,
} from 'src/invocation/command-identity';
import type { ComposioUserContext } from 'src/services/user-context';

/**
 * Records the running registration as the command this invocation runs, with the input
 * `effect/cli` parsed for it (none for a group that only shows its help, so, like `--help`, it
 * runs no invocation hook), then enforces what its `CommandMeta` requires: a shared flag it cannot
 * honor, then a login. Both fail after the identity is recorded, so the failure is reported
 * against the command the user ran, even when a group above it declared the requirement.
 */
const beginSelected = (input: Option.Option<unknown>) =>
  Effect.gen(function* () {
    const identity = yield* CommandRegistration;
    const invocation = yield* CommandInvocation;
    yield* invocation.begin(identity, input);
    yield* rejectUnsupportedSharedFlags(identity);
    if (identity.meta.requiresLogin) {
      yield* assertLoggedIn;
    }
  });

/**
 * A command as a group registers it: its handler may now fail with `NotLoggedInError` or a
 * rejected shared flag's `CommandInputError`.
 */
export type Registered<C> =
  C extends Command.Command<infer Name, infer Input, infer ContextInput, infer E, infer R>
    ? Command.Command<
        Name,
        Input,
        ContextInput,
        E | NotLoggedInError | CommandInputError,
        R | ComposioUserContext | CommandSurface
      >
    : never;

/**
 * Registers `child` under the registration whose dispatch runs it. A group (a command with
 * subcommands) begins its own handler in `withRegisteredSubcommands`.
 */
const registerSubcommand = <C extends Command.Command.Any>(child: C): Registered<C> => {
  const command = child as unknown as Command.Command<string, unknown, unknown, unknown, unknown>;
  const begun =
    command.subcommands.length === 0
      ? Command.provideEffectDiscard(command, (input: unknown) => beginSelected(Option.some(input)))
      : command;
  return Command.provideEffect(
    begun,
    CommandRegistration,
    Effect.gen(function* () {
      const identity = childIdentity(yield* CommandRegistration, command);
      const invocation = yield* CommandInvocation;
      yield* invocation.enter(identity);
      return identity;
    })
  ) as unknown as Registered<C>;
};

/** What a group declares about its own handler, the one that runs when no subcommand is selected. */
export interface GroupOptions {
  /**
   * Whether that handler is an action of its own (`composio dev --mode on`, `composio setup`)
   * rather than the group's help. Off by default: a group made without a handler shows the help
   * `effect/cli` prints for it, and the root shows its overview. Only an action runs the
   * invocation hooks; help, like `--help`, runs none. `effect/cli` does not expose whether a
   * command has a handler, so the group says so here.
   */
  readonly ownAction?: boolean;
}

/**
 * `Command.withSubcommands` for the command tree: registers each subcommand under `self` with
 * its own identity, and begins `self`'s own handler when no subcommand is selected: as the
 * selected command with its input when it is an action (`GroupOptions.ownAction`), else as the
 * group's help. Every group in the tree registers its subcommands with it.
 */
export const withRegisteredSubcommands =
  <const Subcommands extends ReadonlyArray<Command.Command.Any>>(
    subcommands: Subcommands,
    options: GroupOptions = {}
  ) =>
  <const Name extends string, Input, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>
  ) =>
    Command.withSubcommands(
      Command.provideEffectDiscard(self, (input: Input) =>
        beginSelected(options.ownAction === true ? Option.some(input) : Option.none())
      ),
      subcommands.map(child =>
        registerSubcommand<Subcommands[number]>(child)
      ) satisfies ReadonlyArray<Registered<Subcommands[number]>>
    );
