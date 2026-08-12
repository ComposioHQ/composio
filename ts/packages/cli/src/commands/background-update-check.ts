import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { versionCmd } from './version.cmd';
import { checkForUpdateInBackground } from 'src/services/update-check';

type RootCommandInput = {
  readonly subcommand: Option.Option<unknown>;
};

type ParsedSubcommand = readonly [commandTag: unknown, input: unknown];

const isParsedSubcommand = (value: unknown): value is ParsedSubcommand =>
  Array.isArray(value) && value.length === 2;

const isExplicitVersionCheck = (subcommand: Option.Option<unknown>): boolean =>
  Option.exists(subcommand, selected => {
    if (!isParsedSubcommand(selected) || selected[0] !== versionCmd.tag) {
      return false;
    }

    const input = selected[1];
    return typeof input === 'object' && input !== null && 'check' in input && input.check === true;
  });

/**
 * Starts the background update request after @effect/cli has parsed the selected command.
 *
 * @effect/cli v3 retains the selected command tag alongside its parsed input at runtime,
 * even though the public root-input type erases that tuple.
 */
export const withBackgroundUpdateCheck = <
  Name extends string,
  R,
  E,
  Input extends RootCommandInput,
>(
  command: Command.Command<Name, R, E, Input>,
  start: () => void = checkForUpdateInBackground
): Command.Command<Name, R, E, Input> =>
  command.pipe(
    Command.provideEffectDiscard(({ subcommand }) =>
      isExplicitVersionCheck(subcommand) ? Effect.void : Effect.sync(start)
    )
  );
