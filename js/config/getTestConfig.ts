export const env = process.env.TEST_ENV  || "prod"
const CURRENT_FILE_DIR = __dirname;

type config = {
    COMPOSIO_API_KEY: string;
    BACKEND_HERMES_URL: string;
}

export const getTestConfig = (): config => {
    const path = `${CURRENT_FILE_DIR}/test.config.${env}.json`;
    try {
        return JSON.parse(JSON.stringify(require(path))) as unknown as config;
    } catch (error) {
        console.error("Error loading test config file:", error);
        
        throw new Error("Error loading test config file. You  can create test.{{env}}.json file in the config folder.");
    }
}