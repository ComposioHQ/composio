import type { Command } from 'effect/unstable/cli';

/**
 * v4 migration note (read before touching this file)
 *
 * v3's `@effect/cli` exposed a private `CommandDescriptor`/`Usage` tree that this module walked
 * to (a) collect every flag name that accepts a value (for a top-level "Tip: --flag requires a
 * value" hint) and (b) pre-flight parse `argv` against the whole command tree so `commands/index.ts`
 * could rewrite `ValidationError.CommandMismatch` messages to name the resolved command's actual
 * subcommands before `Command.run` rendered them.
 *
 * `effect/unstable/cli`'s public `Command` type has no equivalent descriptor/usage introspection
 * API, and `Command.runWith` (see `cli-main.ts` module docs) renders help and parse/validation
 * errors — including unknown-subcommand messages naming the valid subcommands — itself before
 * re-failing with `CliError.ShowHelp`. That removes the need for both call sites this module used
 * to serve: `commands/index.ts` now always delegates parsing/routing to `Command.runWith`, which
 * already produces the equivalent (though not byte-identical) messaging natively. Rebuilding a
 * private-shape walk of the v4 parser internals to reproduce the exact v3 wording is not
 * supportable via any public API, so that customization is dropped; the resulting error text is
 * unavoidably slightly different from v3, which is a deliberate scope decision, not an oversight.
 *
 * What's left here are the small, still-useful, purely-public-API helpers that `commands/index.ts`
 * needs to resolve a top-level command by name (e.g. to scope `--dangerously-allow` handling to
 * the `dev` command tree). `Command.Any` exposes `name`/`alias` directly, so these no longer touch
 * anything CommandDescriptor-shaped.
 */

export type AnyCommand = Command.Command.Any;

/** Whether `name` is one of the names the command itself answers to. */
export const hasCommandName = (command: AnyCommand, name: string): boolean =>
  command.name === name || command.alias === name;

/**
 * Lists the names of a command's direct subcommands.
 */
export const listSubcommandNames = (command: AnyCommand): ReadonlyArray<string> =>
  Array.from(
    new Set(command.subcommands.flatMap(group => group.commands.map(subcommand => subcommand.name)))
  );
