export const env = process.env.TEST_ENV  || "prod"
export const getTestConfig = ():Record<string,string> => {
    return require(`./test.config.${env}.json`);
}