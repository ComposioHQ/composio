import { Effect, Option, LogLevel, Layer, References } from 'effect';
import { APP_CONFIG } from 'src/config';

/**
 * Sets the minimum log level for subsequent logging operations: the `--log-level` CLI flag
 * wins when present, otherwise the level read from the config (`COMPOSIO_LOG_LEVEL`) applies,
 * otherwise `Info`.
 */
export const setMinimumLogLevel = (logLevelFromCLI: Option.Option<LogLevel.LogLevel>) =>
  APP_CONFIG.LOG_LEVEL.pipe(
    Effect.map(
      (logLevelFromEnv): LogLevel.LogLevel =>
        Option.getOrUndefined(logLevelFromCLI) ?? logLevelFromEnv ?? 'Info'
    ),
    Effect.map(logLevel => Layer.succeed(References.MinimumLogLevel, logLevel)),
    Layer.unwrap
  );

/** The `COMPOSIO_LOG_LEVEL` level alone, for layers built before the root command parses flags. */
export const LogLevelFromConfigLive = setMinimumLogLevel(Option.none());
