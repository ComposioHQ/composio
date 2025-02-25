export const env = "staging";
const CURRENT_FILE_DIR = __dirname;

export type BACKEND_CONFIG = {
  COMPOSIO_API_KEY: string;
  BACKEND_HERMES_URL: string;
  drive: {
    downloadable_file_id: string;
  };
};

export const getTestConfig = (): BACKEND_CONFIG => {
  const path = `${CURRENT_FILE_DIR}/test.config.${env}.json`;
  try {
    return JSON.parse(
      JSON.stringify(require(path))
    ) as unknown as BACKEND_CONFIG;
  } catch (error) {
    console.error("Error loading test config file:", error);
    throw new Error(
      `Error loading test config file. You  can create test.config.${env}.json file in the config folder.`
    );
  }
};
