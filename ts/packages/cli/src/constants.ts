import pkg from '../package.json' with { type: 'json' };

declare const __COMPOSIO_CLI_RELEASE_VERSION__: string | undefined;

// These four values mirror `@composio/core`'s `constants` module. They are
// spelled out here rather than imported because importing anything from the
// core package's root entry at module scope evaluates the whole SDK at startup
// (its zod schemas alone cost ~25ms), for two strings and two URLs. The root
// entry is still bundled, behind the file-upload path's dynamic import.
// `test/src/constants.test.ts` pins these to core's values.

/** Default base URL for the Composio API server (backend). */
export const DEFAULT_BASE_URL = 'https://backend.composio.dev';

/** Default base URL for the Composio web app (frontend). */
export const DEFAULT_WEB_URL = 'https://dashboard.composio.dev/';

/**
 * Staging base URL for the Composio API server (backend).
 * Used when `COMPOSIO_ENVIRONMENT=staging`.
 */
export const STAGING_BASE_URL = 'https://staging-backend.composio.dev';

/**
 * Staging base URL for the Composio web app (frontend).
 * Used when `COMPOSIO_ENVIRONMENT=staging`.
 */
export const STAGING_WEB_URL = 'https://staging-dashboard.composio.dev/';

/**
 * Prefix for user environment variable keys used by the Composio CLI.
 */
export const APP_ENV_CONFIG_KEY_PREFIX = 'COMPOSIO_';

/**
 * Prefix for environment variable keys used by the Composio CLI for debug overrides.
 */
export const DEBUG_OVERRIDE_ENV_CONFIG_KEY_PREFIX = 'DEBUG_OVERRIDE_';

/**
 * Name of the user config file used by the Composio CLI.
 */
export const USER_CONFIG_FILE_NAME = 'user_data.json';

/**
 * Name of the general CLI config file used by the Composio CLI.
 */
export const CLI_CONFIG_FILE_NAME = 'config.json';

/**
 * Name of the directory used to store the Composio CLI config.
 */
export const USER_COMPOSIO_DIR = '.composio';

/**
 * A map of cache filenames used by the Composio CLI.
 */
export const CACHE_FILENAMES = {
  SESSION: 'session.json',
  TOOLKITS: 'toolkits.json',
  TOOLS: 'tools.json',
  TRIGGER_TYPES: 'trigger-types.json',
};

/** Whether the CLI has an exact release version compiled into it. */
export const IS_RELEASE_BUILD = typeof __COMPOSIO_CLI_RELEASE_VERSION__ !== 'undefined';

/**
 * Version of the running Composio CLI.
 *
 * Release builds replace `__COMPOSIO_CLI_RELEASE_VERSION__` with the exact
 * GitHub release version. The private package version is only a source/dev
 * fallback and must never drive binary release selection.
 */
export const APP_VERSION =
  typeof __COMPOSIO_CLI_RELEASE_VERSION__ === 'undefined'
    ? pkg.version
    : __COMPOSIO_CLI_RELEASE_VERSION__;

/**
 * Name of the Composio CLI application, read from `package.json` at build time.
 */
export const APP_NAME = pkg.name;

/**
 * Name of the per-directory project config file.
 */
export const PROJECT_CONFIG_FILE_NAME = 'project.json';

/**
 * Name of the per-directory .env file for CLI-only config overrides.
 */
export const PROJECT_ENV_FILE_NAME = '.env';

/**
 * Name of the per-directory Composio config directory.
 */
export const PROJECT_COMPOSIO_DIR = '.composio';

/**
 * PostHog capture endpoint for CLI telemetry.
 */
export const COMPOSIO_POSTHOG_INGEST_URL = 'https://us.i.posthog.com/i/v0/e/';

declare const COMPOSIO_POSTHOG_PROJECT_API_KEY_BAKED: string | undefined;

/**
 * Public write-only PostHog *project API key* (`phc_...`), baked at build from
 * `COMPOSIO_POSTHOG_PROJECT_API_KEY`. Never a private/personal PostHog key.
 */
export const COMPOSIO_POSTHOG_PROJECT_API_KEY =
  typeof COMPOSIO_POSTHOG_PROJECT_API_KEY_BAKED === 'string'
    ? COMPOSIO_POSTHOG_PROJECT_API_KEY_BAKED
    : '';

/**
 * GitHub repository information for release fetching
 */
export const GITHUB_REPO = {
  OWNER: 'ComposioHQ',
  REPO: 'composio',
  API_BASE_URL: 'https://api.github.com',
} as const;

export {
  CLI_EXPERIMENTAL_FEATURES,
  CLI_RELEASE_CHANNELS,
  type CliReleaseChannel,
} from './experimental-features';
