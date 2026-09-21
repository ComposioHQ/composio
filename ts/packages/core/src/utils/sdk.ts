import { z } from 'zod/v3';
import { ComposioAPIKeyKindError, ComposioNoAPIKeyError } from '../errors/SDKErrors';
import { COMPOSIO_DIR, DEFAULT_BASE_URL, USER_DATA_FILE_NAME } from './constants';
import { getEnvsWithPrefix, getEnvVariable } from './env';
import logger from './logger';
import { ComposioError } from '../errors/ComposioError';
import { ToolkitVersion, ToolkitVersionParam, ToolkitVersions } from '../types/tool.types';
import type { ComposioRequestHeaders } from '../types/composio.types';
import { normalizeToolkitSlug } from './toolkitVersion';
import { platform } from '#platform';

/**
 * Header that carries a Composio user API key (`uak_...`) instead of a project
 * API key. It is the only default header the credential resolver reads.
 */
export const USER_API_KEY_HEADER = 'x-user-api-key';

/** Prefix of Composio user API keys as issued by `composio login`. */
const USER_API_KEY_PREFIX = 'uak_';

// File path helpers
export const userDataPath = () => {
  try {
    const homeDir = platform.homedir();
    if (!homeDir) {
      return null;
    }
    return platform.joinPath(homeDir, COMPOSIO_DIR, USER_DATA_FILE_NAME);
  } catch (_error) {
    logger.debug('Environment', `Unable to get user data path`);
    return null;
  }
};

/**
 * Shape of `~/.composio/user_data.json`. The file is written by the Composio
 * CLI; only the two fields the SDK consumes are validated, everything else is
 * carried through untouched.
 */
const UserDataFileSchema = z
  .object({
    api_key: z.string().nullish(),
    base_url: z.string().nullish(),
  })
  .passthrough();

export type UserDataFile = z.infer<typeof UserDataFileSchema>;

export type UserDataFileRead =
  /** No file system, no home directory, or no file: nothing to fall back to. */
  | { status: 'missing' }
  /** The file exists but is not JSON or does not have the expected shape. */
  | { status: 'malformed'; path: string; reason: string }
  | { status: 'ok'; path: string; data: UserDataFile };

/**
 * Reads and validates the user data JSON file from the Composio directory.
 * File contents never appear in the returned diagnostics.
 */
export const readUserDataFile = (): UserDataFileRead => {
  if (!platform.supportsFileSystem) {
    return { status: 'missing' };
  }
  const dataPath = userDataPath();
  if (!dataPath) {
    return { status: 'missing' };
  }

  let raw: string | Uint8Array;
  try {
    raw = platform.readFileSync(dataPath, 'utf8');
  } catch (_error) {
    logger.debug('Environment', 'No user data file found');
    return { status: 'missing' };
  }

  let json: unknown;
  try {
    json = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
  } catch (_error) {
    logger.debug('Environment', `User data file at ${dataPath} could not be parsed as JSON`);
    return { status: 'malformed', path: dataPath, reason: 'could not be parsed as JSON' };
  }

  const parsed = UserDataFileSchema.safeParse(json);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map(issue => issue.path.join('.'))
      .filter(Boolean)
      .join(', ');
    const reason = fields
      ? `has an unexpected shape (invalid field${fields.includes(',') ? 's' : ''}: ${fields})`
      : 'has an unexpected shape (expected a JSON object)';
    logger.debug('Environment', `User data file at ${dataPath} ${reason}`);
    return { status: 'malformed', path: dataPath, reason };
  }

  return { status: 'ok', path: dataPath, data: parsed.data };
};

/**
 * Reads and parses the user data JSON file from the Composio directory.
 *
 * @returns The validated user data (api_key, base_url, etc.), or an empty object if the file doesn't exist or can't be read
 */
export const getUserDataJson = (): UserDataFile => {
  const read = readUserDataFile();
  return read.status === 'ok' ? read.data : {};
};

const findHeader = (
  headers: ComposioRequestHeaders | undefined,
  name: string
): { name: string; value: string } | undefined => {
  if (!headers) {
    return undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return { name: key, value };
    }
  }
  return undefined;
};

/**
 * Returns the `x-user-api-key` entry from a header map, if it carries a
 * non-empty value. Matches the header name case-insensitively and ignores
 * every other header.
 */
export const getUserApiKeyHeader = (
  headers: ComposioRequestHeaders | undefined
): { name: string; value: string } | undefined => {
  const header = findHeader(headers, USER_API_KEY_HEADER);
  return header && header.value.length > 0 ? header : undefined;
};

export type SDKConfigOptions = {
  /** Default headers the SDK will attach to every request. */
  defaultHeaders?: ComposioRequestHeaders;
};

export type SDKConfig = {
  baseURL: string;
  /** The project API key to send as `x-api-key`, or `null` when project-key auth is disabled. */
  apiKey: string | null;
};

const hasValue = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Resolves the base URL and project API key the SDK will use.
 *
 * Project key resolution distinguishes three caller intents:
 * - a non-empty string is used as-is and nothing else is consulted;
 * - `undefined` (or an empty string) falls back to `COMPOSIO_API_KEY`, then to
 *   the `api_key` stored by the CLI in `~/.composio/user_data.json`;
 * - `null` disables project-key auth: neither `COMPOSIO_API_KEY` nor the stored
 *   `api_key` is read, and the resolver only succeeds when `defaultHeaders`
 *   carries a non-empty `x-user-api-key` header.
 *
 * A stored `uak_` user key is never used as a project key: when it is the only
 * candidate the resolver throws a {@link ComposioAPIKeyKindError} that names the
 * problem without echoing the key.
 */
export function getSDKConfig(
  baseUrl?: string | null,
  apiKey?: string | null,
  options: SDKConfigOptions = {}
): SDKConfig {
  let userData: UserDataFileRead | undefined;
  const readUserData = () => {
    userData ??= readUserDataFile();
    return userData;
  };
  const userDataValue = (field: 'api_key' | 'base_url'): string | undefined => {
    const read = readUserData();
    return read.status === 'ok' && hasValue(read.data[field]) ? read.data[field] : undefined;
  };

  const resolveApiKey = (): string | null => {
    if (apiKey === null) {
      if (getUserApiKeyHeader(options.defaultHeaders)) {
        return null;
      }
      throw new ComposioNoAPIKeyError('Project API key resolution is disabled', {
        cause:
          '`apiKey: null` turns off the COMPOSIO_API_KEY and user config file fallbacks, and no user API key header was configured',
        possibleFixes: [
          'Pass a project API key via `apiKey`, or omit it to fall back to COMPOSIO_API_KEY',
          `To authenticate with a user API key instead, keep \`apiKey: null\` and set the \`${USER_API_KEY_HEADER}\` default header`,
        ],
      });
    }

    if (hasValue(apiKey)) {
      return apiKey;
    }

    const envApiKey = getEnvVariable('COMPOSIO_API_KEY');
    if (hasValue(envApiKey)) {
      return envApiKey;
    }

    const read = readUserData();
    const storedApiKey = userDataValue('api_key');
    if (read.status === 'ok' && hasValue(storedApiKey)) {
      if (storedApiKey.startsWith(USER_API_KEY_PREFIX)) {
        throw new ComposioAPIKeyKindError(undefined, {
          cause: `The user config file at ${read.path} holds a user API key written by the Composio CLI; it cannot authenticate SDK requests as a project`,
          meta: { userDataFilePath: read.path },
        });
      }
      return storedApiKey;
    }

    if (read.status === 'malformed') {
      throw new ComposioNoAPIKeyError('No Composio API key provided', {
        cause: `No API key was passed in the params or in COMPOSIO_API_KEY, and the user config file at ${read.path} ${read.reason}`,
      });
    }
    throw new ComposioNoAPIKeyError();
  };

  let apiKeyParsed: string | null;
  try {
    apiKeyParsed = resolveApiKey();
  } catch (error) {
    ComposioError.handleAndThrow(error);
  }

  const baseURLParsed =
    (hasValue(baseUrl) ? baseUrl : undefined) ??
    getEnvVariable('COMPOSIO_BASE_URL') ??
    userDataValue('base_url') ??
    DEFAULT_BASE_URL;

  logger.debug(
    'Environment',
    apiKeyParsed === null ? 'API Key: [DISABLED]' : 'API Key: [REDACTED]'
  );
  logger.debug('Environment', `Base URL: ${baseURLParsed}`);

  return { baseURL: baseURLParsed, apiKey: apiKeyParsed };
}

/**
 * Gets toolkit versions configuration by merging environment variables, user-provided defaults, and fallbacks.
 *
 * Priority order:
 * 1. If defaultVersions is a string, use it as global version for all toolkits
 * 2. User-provided toolkit version mappings (defaultVersions object)
 * 3. Environment variables (COMPOSIO_TOOLKIT_VERSION_<TOOLKIT_NAME>)
 * 4. Fallback to 'latest' if no versions are configured
 *
 * @param defaultVersions - Optional default versions configuration (string for global version or object mapping toolkit names to versions)
 * @returns Toolkit versions configuration - either a global version string, toolkit-specific version mapping, or 'latest'
 */
export function getToolkitVersionsFromEnv(
  defaultVersions?: ToolkitVersionParam
): ToolkitVersionParam {
  // if already set by user either a single version or 'latest' use that as is / override everything else
  if (defaultVersions && typeof defaultVersions === 'string') {
    return defaultVersions;
  }

  // check if there are envs similar to COMPOSIO_TOOLKIT_VERSION_GITHUB then extract the toolkit name
  const envPrefixedVersions = getEnvsWithPrefix(`COMPOSIO_TOOLKIT_VERSION_`);
  const toolkitVersionsFromEnv = Object.entries(envPrefixedVersions).reduce((acc, [key, value]) => {
    const toolkitName = key.replace('COMPOSIO_TOOLKIT_VERSION_', '');
    acc[normalizeToolkitSlug(toolkitName)] = value as ToolkitVersion;
    return acc;
  }, {} as ToolkitVersions);

  // normalize keys via normalizeToolkitSlug (the same helper the lookup uses);
  // user provided values act as overrides
  let userProvidedToolkitVersions = {};
  if (defaultVersions && typeof defaultVersions === 'object') {
    userProvidedToolkitVersions = Object.fromEntries(
      Object.entries(defaultVersions).map(([key, value]) => [normalizeToolkitSlug(key), value])
    );
  }

  // final toolkit versions
  const toolkitVersions = {
    ...toolkitVersionsFromEnv,
    ...userProvidedToolkitVersions,
  };

  // if the toolkitVersions are empty, use 'latest'
  if (Object.keys(toolkitVersions).length === 0) {
    return 'latest';
  }

  return toolkitVersions;
}
