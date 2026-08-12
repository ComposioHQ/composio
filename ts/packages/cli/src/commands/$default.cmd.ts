import { Context, Schema, LogLevel, Equal, Layer, Effect } from 'effect';
import { Command, Options } from '@effect/cli';
import { setMinimumLogLevel } from 'src/effects/with-log-level';
import type { ConfigError } from 'effect/ConfigError';

const logLevelEntries = [
  ['all', LogLevel.All],
  ['fatal', LogLevel.Fatal],
  ['error', LogLevel.Error],
  ['warning', LogLevel.Warning],
  ['info', LogLevel.Info],
  ['debug', LogLevel.Debug],
  ['trace', LogLevel.Trace],
  ['none', LogLevel.None],
] as const satisfies ReadonlyArray<readonly [string, LogLevel.LogLevel]>;

const logLevelChoices = logLevelEntries.map(([choice]) => choice);

const decodeLogLevel = (literal: (typeof logLevelChoices)[number]): LogLevel.LogLevel =>
  logLevelEntries.find(([choice]) => choice === literal)?.[1] ?? LogLevel.None;

const encodeLogLevel = (logLevel: LogLevel.LogLevel): (typeof logLevelChoices)[number] =>
  logLevelEntries.find(([, value]) => Equal.equals(value, logLevel))?.[0] ?? 'none';

const LogLevelLiteralSchema = Schema.Literal(...logLevelChoices)
  .annotations({
    identifier: 'LogLevelLiteral',
  })
  .pipe(
    Schema.transform(
      Schema.declare((input: unknown): input is LogLevel.LogLevel =>
        logLevelEntries.some(([, logLevel]) => Equal.equals(input, logLevel))
      ).annotations({
        identifier: 'LogLevel',
      }),
      {
        decode: decodeLogLevel,
        encode: encodeLogLevel,
        strict: true,
      }
    )
  );

const logLevel = Options.choice('log-level', logLevelChoices).pipe(
  Options.withSchema(LogLevelLiteralSchema),
  Options.withDescription('Define log level'),
  Options.optional
);

class $DefaultCmdContext extends Context.Tag('cli/$DefaultCmdContext')<
  $DefaultCmdContext,
  Layer.Layer<never, ConfigError, never>
>() {}

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
