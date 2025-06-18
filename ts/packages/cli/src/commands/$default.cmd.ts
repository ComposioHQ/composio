import { Context, Schema, LogLevel, String, pipe, Layer, Effect } from 'effect';
import { Command, Options } from '@effect/cli';
import { setMinimumLogLevel } from 'src/effects/with-log-level';
import type { ConfigError } from 'effect/ConfigError';
import { versionCmd } from './version.cmd';

const logLevelChoices = LogLevel.allLevels.map(level => String.toLowerCase(level._tag));

const LogLevelLiteralSchema = Schema.Literal(...logLevelChoices)
  .annotations({
    identifier: 'LogLevelLiteral',
  })
  .pipe(
    Schema.transform(
      Schema.declare((input: unknown): input is LogLevel.LogLevel =>
        LogLevel.allLevels.includes(input as LogLevel.LogLevel)
      ).annotations({
        identifier: 'LogLevel',
      }),
      {
        decode: literal => pipe(literal, String.capitalize, LogLevel.fromLiteral),
        encode: logLevel => String.toLowerCase(logLevel._tag),
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
  Command.withSubcommands([versionCmd]),
  Command.withDescription(
    `Composio CLI - A tool for managing Python and TypeScript composio.dev projects.`
  ),
  Command.provideEffect($DefaultCmdContext, ({ logLevel }) =>
    Effect.succeed(setMinimumLogLevel(logLevel))
  )
);
