import { Config, LogLevel, Option } from 'effect';

type APP_CONFIG = Config.Config.Wrap<{
  API_KEY: string;
  BASE_URL: Option.Option<string>;
  CACHE_DIR: Option.Option<string>;
  LOG_LEVEL: Option.Option<LogLevel.LogLevel>;
}>;

/**
 * Describe every configuration key used at runtime.
 * Keys are read from environment variables (with the `${APP_ENV_CONFIG_KEY_PREFIX}_<key>` format),
 * or from the user config file (in JSON format).
 */
export const APP_CONFIG = {
  // The API key for the Composio API
  API_KEY: Config.string('API_KEY'),

  // The base URL for the Composio API
  BASE_URL: Config.option(Config.string('BASE_URL')),

  // The cache directory for the Composio CLI
  CACHE_DIR: Config.option(Config.string('CACHE_DIR')),

  // The log level for the Composio CLI
  LOG_LEVEL: Config.option(Config.logLevel('LOG_LEVEL')),
} satisfies APP_CONFIG;
