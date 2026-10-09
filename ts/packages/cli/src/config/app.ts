import { Config, Schema } from 'effect';
import * as constants from 'src/constants';
import { flag, optionalLogLevel, optionalString } from './env';

const ENVIRONMENT = optionalString('COMPOSIO_ENVIRONMENT');

/** The explicit `name` value, else the `COMPOSIO_ENVIRONMENT`-derived default. */
const url = (name: string, prodDefault: string, stagingDefault: string) =>
  Config.all({ explicit: optionalString(name), environment: ENVIRONMENT }).pipe(
    Config.map(
      ({ explicit, environment }) =>
        explicit ?? (environment === 'staging' ? stagingDefault : prodDefault)
    )
  );

/**
 * The `COMPOSIO_*` variables users set to configure the CLI, documented in the README.
 *
 * URL precedence (highest → lowest):
 *   COMPOSIO_BASE_URL  →  COMPOSIO_ENVIRONMENT-derived  →  DEFAULT_BASE_URL
 *   COMPOSIO_WEB_URL   →  COMPOSIO_ENVIRONMENT-derived  →  DEFAULT_WEB_URL
 */
export const APP_CONFIG = {
  // The API key for the Composio API
  USER_API_KEY: optionalString('COMPOSIO_USER_API_KEY'),

  // The deployment environment ("production" | "staging"). Controls URL defaults.
  ENVIRONMENT,

  // The base URL for the Composio API
  BASE_URL: url('COMPOSIO_BASE_URL', constants.DEFAULT_BASE_URL, constants.STAGING_BASE_URL),

  // The base URL for the Composio web app
  WEB_URL: url('COMPOSIO_WEB_URL', constants.DEFAULT_WEB_URL, constants.STAGING_WEB_URL),

  // The cache directory for the Composio CLI
  CACHE_DIR: optionalString('COMPOSIO_CACHE_DIR'),

  // Override the root directory for CLI session artifacts
  SESSION_DIR: optionalString('COMPOSIO_SESSION_DIR'),

  // Override the directory added to PATH by `composio install`
  BIN_DIR: optionalString('COMPOSIO_BIN_DIR'),

  // The log level for the Composio CLI
  LOG_LEVEL: optionalLogLevel('COMPOSIO_LOG_LEVEL'),

  // The organization and project for multi-project auth (override file-based config)
  ORG_ID: optionalString('COMPOSIO_ORG_ID'),
  PROJECT_ID: optionalString('COMPOSIO_PROJECT_ID'),

  // Override the Composio agents service URL
  AGENTS_BASE_URL: optionalString('COMPOSIO_AGENTS_BASE_URL'),

  // Sign forwarded trigger payloads with this secret
  WEBHOOK_SECRET: optionalString('COMPOSIO_WEBHOOK_SECRET'),

  // Internal context propagated between CLI processes
  CLI_INVOCATION_ORIGIN: optionalString('COMPOSIO_CLI_INVOCATION_ORIGIN'),
  CLI_PARENT_RUN_ID: optionalString('COMPOSIO_CLI_PARENT_RUN_ID'),
  RUN_OUTPUT_DIR: optionalString('COMPOSIO_RUN_OUTPUT_DIR'),

  // Disable connected account cache (defaults to true — cache is off by default)
  DISABLE_CONNECTED_ACCOUNT_CACHE: flag('COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE', true),

  // Every `COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>=<version>` pin, keyed by `<TOOLKIT>` as written.
  // `Config.Record` reads the whole `COMPOSIO_TOOLKIT_VERSION` subtree of the environment.
  TOOLKIT_VERSIONS: Config.option(
    Config.Record(Schema.String, Schema.String, ['COMPOSIO', 'TOOLKIT', 'VERSION'])
  ),
};
