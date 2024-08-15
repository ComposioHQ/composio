export const env = process.env.TEST_ENV  || "prod"
const CURRENT_FILE_DIR = __dirname;
export const getTestConfig = (): Record<string, string> => {
    const path = `${CURRENT_FILE_DIR}/test.config.${env}.json`;
    return JSON.parse(JSON.stringify(require(path)));
}