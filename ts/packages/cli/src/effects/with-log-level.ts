import { Effect, Option, Logger, LogLevel, Layer } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';

/**
 * Sets the minimum log level for subsequent logging operation, preferring the given log level,
 * and falling back to the one read from the config.
 */
export const setMinimumLogLevel = (logLevelFromCLI: Option.Option<LogLevel.LogLevel>) =>
  APP_CONFIG['LOG_LEVEL'].pipe(
    Effect.map(logLevelFromEnv => {
      return Option.zipLeft(logLevelFromCLI, logLevelFromEnv);
    }),
    Effect.map(Option.getOrElse(() => LogLevel.Info)),
    Effect.map(logLevel => Logger.minimumLogLevel(logLevel)),
    Layer.unwrapEffect
  );
