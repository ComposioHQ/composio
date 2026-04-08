import { constants } from '@composio/core';
import pkg from '../package.json' with { type: 'json' };

const { DEFAULT_BASE_URL, DEFAULT_WEB_URL } = constants;

export { DEFAULT_BASE_URL, DEFAULT_WEB_URL };

/**
 * Staging base URL for the Composio API server (backend).
 * Used when `COMPOSIO_ENVIRONMENT=staging`.
 */
export const STAGING_BASE_URL = 'https://staging-backend.composio.dev';

/**
 * Staging base URL for the Composio web app (frontend).
 * Used when `COMPOSIO_ENVIRONMENT=staging`.
 */
export const STAGING_WEB_URL = 'https://staging-platform.composio.dev';

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
export const USER_CONFIG_FILE_NAME = constants.USER_DATA_FILE_NAME;

/**
 * Name of the general CLI config file used by the Composio CLI.
 */
export const CLI_CONFIG_FILE_NAME = 'config.json';

/**
 * Name of the directory used to store the Composio CLI config.
 */
export const USER_COMPOSIO_DIR = constants.COMPOSIO_DIR;

/**
 * A map of cache filenames used by the Composio CLI.
 */
export const CACHE_FILENAMES = {
  SESSION: 'session.json',
  TOOLKITS: 'toolkits.json',
  TOOLS: 'tools.json',
  TRIGGER_TYPES: 'trigger-types.json',
};

/**
 * Version of the Composio CLI, read from `package.json` at build time.
 */
export const APP_VERSION = pkg.version;

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
