import { ComposioNoAPIKeyError } from '../errors/SDKErrors';
import { COMPOSIO_DIR, DEFAULT_BASE_URL, USER_DATA_FILE_NAME } from './constants';
import { getEnvVariable } from './env';
import logger from './logger';
import { ComposioError } from '../errors/ComposioError';

// File path helpers
export const userDataPath = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('os');
    return path.join(os.homedir(), COMPOSIO_DIR, USER_DATA_FILE_NAME);
  } catch (_error) {
    logger.debug('Environment', `Unable to get user data path`);
    return null;
  }
};

export const getUserDataJson = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const data = fs.readFileSync(userDataPath(), 'utf8');
    return JSON.parse(data);
  } catch (_error) {
    logger.debug('Environment', 'No user data file found');
    return {};
  }
};

// Client configuration functions
export function getSDKConfig(baseUrl?: string | null, apiKey?: string | null) {
  const userData = getUserDataJson();
  const { api_key: apiKeyFromUserConfig, base_url: baseURLFromUserConfig } = userData;

  const baseURLParsed =
    baseUrl || getEnvVariable('COMPOSIO_BASE_URL') || baseURLFromUserConfig || DEFAULT_BASE_URL;
  const apiKeyParsed = apiKey || getEnvVariable('COMPOSIO_API_KEY') || apiKeyFromUserConfig || '';

  if (!apiKeyParsed) {
    ComposioError.handle(new ComposioNoAPIKeyError(), {
      exitProcess: true,
    });
  }

  logger.debug('Environment', `API Key: ${apiKeyParsed}`);
  logger.debug('Environment', `Base URL: ${baseURLParsed}`);

  return { baseURL: baseURLParsed, apiKey: apiKeyParsed };
}
