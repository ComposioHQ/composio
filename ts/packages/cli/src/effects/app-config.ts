import { Config, LogLevel, Option } from 'effect';
import * as constants from 'src/constants';

type APP_CONFIG = Config.Config.Wrap<{
  API_KEY: Option.Option<string>;
  BASE_URL: string;
  WEB_URL: string;
  CACHE_DIR: Option.Option<string>;
  LOG_LEVEL: Option.Option<LogLevel.LogLevel>;
  ORG_ID: Option.Option<string>;
  PROJECT_ID: Option.Option<string>;
}>;

/**
 * Describe every configuration key used at runtime.
 * Keys are read from environment variables (with the `${APP_ENV_CONFIG_KEY_PREFIX}<key>` format).
 */
export const APP_CONFIG = {
  // The API key for the Composio API
  API_KEY: Config.option(Config.string('API_KEY')),

  // The base URL for the Composio API
  BASE_URL: Config.string('BASE_URL').pipe(Config.withDefault(constants.DEFAULT_BASE_URL)),

  // The base URL for the Composio web app
  WEB_URL: Config.string('WEB_URL').pipe(Config.withDefault(constants.DEFAULT_WEB_URL)),

  // The cache directory for the Composio CLI
  CACHE_DIR: Config.option(Config.string('CACHE_DIR')),

  // The log level for the Composio CLI
  LOG_LEVEL: Config.option(Config.logLevel('LOG_LEVEL')),

  // The organization ID for multi-project auth (overrides file-based config)
  ORG_ID: Config.option(Config.string('ORG_ID')),

  // The project ID for multi-project auth (overrides file-based config)
  PROJECT_ID: Config.option(Config.string('PROJECT_ID')),
} satisfies APP_CONFIG;
