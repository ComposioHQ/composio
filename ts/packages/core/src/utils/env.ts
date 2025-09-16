export const getEnvVariable = (
  name: string,
  defaultValue: string | undefined = undefined
): string | undefined => {
  try {
    return process.env[name] || defaultValue;
  } catch (_e) {
    return defaultValue;
  }
};

/**
 * Method to return all the envs based on a specific prefix
 * @param prefix
 * @example
 * COMPOSIO_TOOLKIT_VERSION_GITHUB=20250902_00
 * COMPOSIO_TOOLKIT_VERSION_SLACK=20250902_00
 * COMPOSIO_TOOLKIT_VERSION_GMAIL=latest
 * @returns {Record<string, unknown>}
 * @returns
 */
export const getEnvsWithPrefix = (prefix: string): Record<string, unknown> => {
  try {
    if (process && process.env) {
      return Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key.startsWith(prefix))
      );
    } else {
      return {};
    }
  } catch (error) {
    return {};
  }
};
