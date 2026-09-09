import type { LogLevel } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { setMinimumLogLevel } from 'src/effects/with-log-level';

const logLevelEntries = [
  ['all', 'All'],
  ['fatal', 'Fatal'],
  ['error', 'Error'],
  ['warn', 'Warn'],
  ['info', 'Info'],
  ['debug', 'Debug'],
  ['trace', 'Trace'],
  ['none', 'None'],
] as const satisfies ReadonlyArray<readonly [string, LogLevel.LogLevel]>;

const logLevel = Flag.choiceWithValue('log-level', logLevelEntries).pipe(
  Flag.withDescription('Define log level'),
  Flag.optional
);

/**
 * CLI entry point for the Composio CLI.
 *
 * `--log-level` is a shared flag: v4 only applies a plain root flag when no
 * subcommand is selected, so `composio --log-level debug version` needs the
 * flag to be inherited by every subcommand.
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
  ),
  Command.provide(({ logLevel }) => setMinimumLogLevel(logLevel))
);
