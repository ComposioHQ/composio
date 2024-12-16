// Constants
export const COMPOSIO_DIR = ".composio";
export const USER_DATA_FILE_NAME = "user_data.json";
export const TEMP_FILES_DIRECTORY_NAME = "files";
export const DEFAULT_BASE_URL = "https://backend.composio.dev";

export const TELEMETRY_URL = "https://app.composio.dev";

export const IS_DEVELOPMENT_OR_CI =
  process.env.DEVELOPMENT || process.env.CI || false;
