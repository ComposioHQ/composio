import { Config, ConfigProvider, Effect, LogLevel, Option } from 'effect';
import * as constants from 'src/constants';

type APP_CONFIG = Config.Wrap<{
  USER_API_KEY: Option.Option<string>;
  ENVIRONMENT: Option.Option<string>;
  BASE_URL: string;
  WEB_URL: string;
  CACHE_DIR: Option.Option<string>;
  LOG_LEVEL: Option.Option<LogLevel.LogLevel>;
  ORG_ID: Option.Option<string>;
  PROJECT_ID: Option.Option<string>;
  DISABLE_CONNECTED_ACCOUNT_CACHE: boolean;
}>;

const LOG_LEVEL_VALUES: ReadonlySet<string> = new Set(LogLevel.values);

/**
 * Titlecases a raw log-level string (`"info"` -> `"Info"`, `"DEBUG"` -> `"Debug"`).
 */
const normalizeLogLevelCase = (value: string): string =>
  value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1).toLowerCase()}`;

/**
 * Case-insensitive counterpart to `Config.logLevel`.
 *
 * `effect/Config`'s built-in `Config.logLevel` is case-sensitive in v4 (it only
 * accepts the exact `LogLevel.values` casing), whereas Composio has always
 * accepted `COMPOSIO_LOG_LEVEL=info`/`INFO`/`Info` interchangeably. Normalize the
 * casing before validating so that pre-existing behavior is preserved.
 */
const logLevelConfig = (name: string): Config.Config<LogLevel.LogLevel> =>
  Config.string(name).pipe(
    Config.mapOrFail(value => {
      const normalized = normalizeLogLevelCase(value);
      return LOG_LEVEL_VALUES.has(normalized)
        ? Effect.succeed(normalized as LogLevel.LogLevel)
        : Effect.fail(
            new Config.ConfigError(
              new ConfigProvider.SourceError({
                message: `Expected a log level but received ${JSON.stringify(value)}`,
              })
            )
          );
    })
  );

/**
 * Derives a URL default based on the `COMPOSIO_ENVIRONMENT` config key.
 * Returns `stagingDefault` when ENVIRONMENT is `"staging"`, otherwise `prodDefault`.
 */
const environmentBasedDefault = (
  prodDefault: string,
  stagingDefault: string
): Config.Config<string> =>
  Config.string('ENVIRONMENT').pipe(
    Config.map(env => (env === 'staging' ? stagingDefault : prodDefault)),
    Config.withDefault(prodDefault)
  );

/**
 * Describe every configuration key used at runtime.
 * Keys are read from environment variables (with the `${APP_ENV_CONFIG_KEY_PREFIX}<key>` format).
 *
 * URL precedence (highest → lowest):
 *   COMPOSIO_BASE_URL  →  COMPOSIO_ENVIRONMENT-derived  →  DEFAULT_BASE_URL
 *   COMPOSIO_WEB_URL   →  COMPOSIO_ENVIRONMENT-derived  →  DEFAULT_WEB_URL
 */
export const APP_CONFIG = {
  // The API key for the Composio API
  USER_API_KEY: Config.option(Config.string('USER_API_KEY')),

  // The deployment environment ("production" | "staging"). Controls URL defaults.
  ENVIRONMENT: Config.option(Config.string('ENVIRONMENT')),

  // The base URL for the Composio API
  BASE_URL: Config.string('BASE_URL').pipe(
    Config.orElse(() =>
      environmentBasedDefault(constants.DEFAULT_BASE_URL, constants.STAGING_BASE_URL)
    )
  ),

  // The base URL for the Composio web app
  WEB_URL: Config.string('WEB_URL').pipe(
    Config.orElse(() =>
      environmentBasedDefault(constants.DEFAULT_WEB_URL, constants.STAGING_WEB_URL)
    )
  ),

  // The cache directory for the Composio CLI
  CACHE_DIR: Config.option(Config.string('CACHE_DIR')),

  // The log level for the Composio CLI
  LOG_LEVEL: Config.option(logLevelConfig('LOG_LEVEL')),

  // The organization ID for multi-project auth (overrides file-based config)
  ORG_ID: Config.option(Config.string('ORG_ID')),

  // The project ID for multi-project auth (overrides file-based config)
  PROJECT_ID: Config.option(Config.string('PROJECT_ID')),

  // Disable connected account cache (defaults to true — cache is off by default)
  DISABLE_CONNECTED_ACCOUNT_CACHE: Config.boolean('DISABLE_CONNECTED_ACCOUNT_CACHE').pipe(
    Config.withDefault(true)
  ),
} satisfies APP_CONFIG;
