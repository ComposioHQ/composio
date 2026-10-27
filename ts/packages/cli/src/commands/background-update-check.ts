import { Effect, Predicate } from 'effect';
import { Command } from 'effect/cli';
import { versionCmd } from './version.cmd';
import { upgradeCmd } from './upgrade/upgrade.cmd';
import { checkForUpdateInBackground } from 'src/services/update-check';
import { withRegisteredSubcommands } from 'src/commands/registration';

const isExplicitVersionCheck = (commandName: string, input: unknown): boolean =>
  commandName === versionCmd.name && Predicate.hasProperty(input, 'check') && input.check === true;

/** `composio upgrade` resolves releases itself and records a live stable result in the cache. */
const resolvesReleasesItself = (commandName: string, input: unknown): boolean =>
  commandName === upgradeCmd.name || isExplicitVersionCheck(commandName, input);

/**
 * Builds the root command so the background update request starts only after the CLI has parsed
 * the selected command, and never for an explicit `composio version --check` or `composio upgrade`.
 *
 * `effect/cli` keeps the selected subcommand private to the parent's dispatcher, so the
 * hook is attached per subcommand (each sees its own parsed input) plus the root itself for the
 * no-subcommand path, before the tree is assembled with `withRegisteredSubcommands`, which also
 * registers each subcommand under the root.
 */
export const withBackgroundUpdateCheck = <
  const Name extends string,
  Input,
  ContextInput,
  E,
  R,
  const Subcommands extends ReadonlyArray<Command.Command.Any>,
>(
  root: Command.Command<Name, Input, ContextInput, E, R>,
  subcommands: Subcommands,
  start: () => void = checkForUpdateInBackground
) => {
  const startInBackground = Effect.sync(start);
  const guarded = subcommands.map(subcommand =>
    subcommand.pipe(
      Command.provideEffectDiscard((input: unknown) =>
        resolvesReleasesItself(subcommand.name, input) ? Effect.void : startInBackground
      )
    )
  ) as unknown as Subcommands;

  return root.pipe(
    Command.provideEffectDiscard(startInBackground),
    withRegisteredSubcommands(guarded)
  );
};
