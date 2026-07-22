import { Effect, Option, LogLevel, Layer, References } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';

/**
 * Sets the minimum log level for subsequent logging operations: the `--log-level` CLI flag
 * wins when present, otherwise falls back to the level read from the config (`COMPOSIO_LOG_LEVEL`),
 * otherwise defaults to `'Info'`.
 */
export const setMinimumLogLevel = (logLevelFromCLI: Option.Option<LogLevel.LogLevel>) =>
  APP_CONFIG['LOG_LEVEL'].pipe(
    Effect.map(logLevelFromEnv => {
      return Option.orElse(logLevelFromCLI, () => logLevelFromEnv);
    }),
    Effect.map(Option.getOrElse((): LogLevel.LogLevel => 'Info')),
    Effect.map(logLevel => Layer.succeed(References.MinimumLogLevel, logLevel)),
    Layer.unwrap
  );
