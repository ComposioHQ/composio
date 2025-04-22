export const getEnvVariable = (
  name: string,
  defaultValue: string | undefined = undefined
): string | undefined => {
  try {
    return process.env[name] || defaultValue;
  } catch (_e) {
    console.error(`Error getting environment variable ${name}:`, _e);
    return defaultValue;
  }
};
