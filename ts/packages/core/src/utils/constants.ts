import { getEnvVariable } from './env';

// Constants
export const COMPOSIO_DIR = '.composio';
export const USER_DATA_FILE_NAME = 'user_data.json';
export const TEMP_FILES_DIRECTORY_NAME = 'files';
export const DEFAULT_BASE_URL = 'https://backend.composio.dev';
export const DEFAULT_WEB_URL = 'https://platform.composio.dev';

export const TELEMETRY_URL = 'https://app.composio.dev';
export const CLIENT_PUSHER_KEY = getEnvVariable('CLIENT_PUSHER_KEY') || 'ff9f18c208855d77a152';

export const COMPOSIO_LOG_LEVEL = getEnvVariable('COMPOSIO_LOG_LEVEL') as
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | undefined;

export const IS_DEVELOPMENT_OR_CI = getEnvVariable('DEVELOPMENT') || getEnvVariable('CI') || false;
