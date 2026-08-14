import { Config, Effect, LogLevel, Option } from 'effect';
import * as constants from 'src/constants';

type APP_CONFIG = Config.Config.Wrap<{
  USER_API_KEY: Option.Option<string>;
  ENVIRONMENT: Option.Option<string>;
  BASE_URL: string;
  WEB_URL: string;
  CACHE_DIR: Option.Option<string>;
  SESSION_DIR: Option.Option<string>;
  BIN_DIR: Option.Option<string>;
  LOG_LEVEL: Option.Option<LogLevel.LogLevel>;
  ORG_ID: Option.Option<string>;
  PROJECT_ID: Option.Option<string>;
  AGENTS_BASE_URL: Option.Option<string>;
  WEBHOOK_SECRET: Option.Option<string>;
  CLI_INVOCATION_ORIGIN: Option.Option<string>;
  CLI_PARENT_RUN_ID: Option.Option<string>;
  RUN_ACP_ONLY: Option.Option<string>;
  RUN_OUTPUT_DIR: Option.Option<string>;
  PERF_DEBUG: Option.Option<string>;
  TOOL_DEBUG: Option.Option<string>;
  DISABLE_CONNECTED_ACCOUNT_CACHE: boolean;
}>;

/** Load optional app config while exposing absence as `undefined` to callers. */
export const loadOptionalAppConfig = <A>(config: Config.Config<Option.Option<A>>) =>
  Effect.orDie(config).pipe(Effect.map(Option.getOrUndefined));

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

  // Override the root directory for CLI session artifacts
  SESSION_DIR: Config.option(Config.string('SESSION_DIR')),

  // Override the directory added to PATH by `composio install`
  BIN_DIR: Config.option(Config.string('BIN_DIR')),

  // The log level for the Composio CLI
  LOG_LEVEL: Config.option(Config.logLevel('LOG_LEVEL')),

  // The organization ID for multi-project auth (overrides file-based config)
  ORG_ID: Config.option(Config.string('ORG_ID')),

  // The project ID for multi-project auth (overrides file-based config)
  PROJECT_ID: Config.option(Config.string('PROJECT_ID')),

  // Override the Composio agents service URL
  AGENTS_BASE_URL: Config.option(Config.string('AGENTS_BASE_URL')),

  // Sign forwarded trigger payloads with this secret
  WEBHOOK_SECRET: Config.option(Config.string('WEBHOOK_SECRET')),

  // Internal context propagated between CLI processes
  CLI_INVOCATION_ORIGIN: Config.option(Config.string('CLI_INVOCATION_ORIGIN')),
  CLI_PARENT_RUN_ID: Config.option(Config.string('CLI_PARENT_RUN_ID')),
  RUN_ACP_ONLY: Config.option(Config.string('RUN_ACP_ONLY')),
  RUN_OUTPUT_DIR: Config.option(Config.string('RUN_OUTPUT_DIR')),

  // Runtime debug flags
  PERF_DEBUG: Config.option(Config.string('PERF_DEBUG')),
  TOOL_DEBUG: Config.option(Config.string('TOOL_DEBUG')),

  // Disable connected account cache (defaults to true — cache is off by default)
  DISABLE_CONNECTED_ACCOUNT_CACHE: Config.boolean('DISABLE_CONNECTED_ACCOUNT_CACHE').pipe(
    Config.withDefault(true)
  ),
} satisfies APP_CONFIG;
