// Constants
export const LOCAL_CACHE_DIRECTORY_NAME = ".composio";
export const USER_DATA_FILE_NAME = "user_data.json";
export const DEFAULT_BASE_URL = "https://backend.composio.dev";

export const TELEMETRY_URL = "https://app.composio.dev"

export const IS_DEVELOPMENT_OR_CI = (process.env.DEVELOPMENT || process.env.CI) || false;
