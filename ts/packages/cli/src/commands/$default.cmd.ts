import { LogLevel, type Option } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { setMinimumLogLevel } from 'src/effects/with-log-level';

const logLevel = Flag.choice('log-level', LogLevel.values).pipe(
  Flag.withDescription('Define log level'),
  Flag.optional
);

/**
 * CLI entry point for the Composio CLI.
 *
 * `--log-level` is a shared flag: v4 only applies a plain root flag when no
 * subcommand is selected, so `composio --log-level Debug version` needs the
 * flag to be inherited by every subcommand. The minimum log level is applied by
 * `withRootLogLevel` once the subcommand tree is attached, because
 * `Command.provide` wraps only the handler that exists when it is called.
 *
 * @example
 * ```bash
 * composio <subcommand>
 * ```
 */
export const $defaultCmd = Command.make('composio').pipe(
  Command.withSharedFlags({ logLevel }),
  Command.withDescription(
    `Composio CLI - A tool for managing Python and TypeScript composio.dev projects.`
  )
);

/**
 * Applies `--log-level` (falling back to `COMPOSIO_LOG_LEVEL`) to the root handler and every
 * subcommand it dispatches to. Call it on the fully assembled root command, after
 * `Command.withSubcommands`.
 */
export const withRootLogLevel = <
  const Name extends string,
  Input extends { readonly logLevel: Option.Option<LogLevel.LogLevel> },
  ContextInput,
  E,
  R,
>(
  root: Command.Command<Name, Input, ContextInput, E, R>
) => root.pipe(Command.provide(({ logLevel }: Input) => setMinimumLogLevel(logLevel)));
