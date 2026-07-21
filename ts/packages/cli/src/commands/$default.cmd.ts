import { Context, LogLevel, Layer, Effect, type Config } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { setMinimumLogLevel } from 'src/effects/with-log-level';

const logLevelEntries = [
  ['all', 'All'],
  ['fatal', 'Fatal'],
  ['error', 'Error'],
  ['warning', 'Warn'],
  ['info', 'Info'],
  ['debug', 'Debug'],
  ['trace', 'Trace'],
  ['none', 'None'],
] as const satisfies ReadonlyArray<readonly [string, LogLevel.LogLevel]>;

const logLevel = Flag.choiceWithValue('log-level', logLevelEntries).pipe(
  Flag.withDescription('Define log level'),
  Flag.optional
);

class $DefaultCmdContext extends Context.Service<
  $DefaultCmdContext,
  Layer.Layer<never, Config.ConfigError, never>
>()('cli/$DefaultCmdContext') {}

/**
 * CLI entry point for the Composio CLI.
 *
 * @example
 * ```bash
 * composio <subcommand>
 * ```
 */
export const $defaultCmd = Command.make('composio', { logLevel }).pipe(
  Command.withDescription(
    `Composio CLI - A tool for managing Python and TypeScript composio.dev projects.`
  ),
  Command.provideEffect($DefaultCmdContext, ({ logLevel }) =>
    Effect.succeed(setMinimumLogLevel(logLevel))
  )
);
