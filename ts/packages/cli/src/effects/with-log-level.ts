import { Effect, Option, Logger, LogLevel, Layer } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';

/**
 * Sets the minimum log level for subsequent logging operations: the `--log-level` CLI flag
 * wins when present, otherwise the level read from the config (`COMPOSIO_LOG_LEVEL`) applies,
 * otherwise `Info`.
 */
export const setMinimumLogLevel = (logLevelFromCLI: Option.Option<LogLevel.LogLevel>) =>
  APP_CONFIG['LOG_LEVEL'].pipe(
    Effect.map(logLevelFromEnv => {
      return Option.orElse(logLevelFromCLI, () => logLevelFromEnv);
    }),
    Effect.map(Option.getOrElse(() => LogLevel.Info)),
    Effect.map(logLevel => Logger.minimumLogLevel(logLevel)),
    Layer.unwrapEffect
  );
