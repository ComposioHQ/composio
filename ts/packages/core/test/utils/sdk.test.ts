import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getSDKConfig, resolveCredentialHeaders } from '../../src/utils/sdk';
import {
  ComposioAPIKeyKindError,
  ComposioNoAPIKeyError,
  SDKErrorCodes,
} from '../../src/errors/SDKErrors';
import { DEFAULT_BASE_URL } from '../../src/utils/constants';

const USER_KEY = 'uak_cliUserKeyValue';
const ORG_KEY = 'oak_orgKeyValue';
const PROJECT_KEY = 'ak_projectKeyValue';
const ENV_KEY = 'ak_envKeyValue';
const EXPLICIT_KEY = 'ak_explicitKeyValue';

describe('getSDKConfig credential resolution', () => {
  let home: string;

  const userDataPath = () => path.join(home, '.composio', 'user_data.json');

  const writeUserData = (contents: string | Record<string, unknown>) => {
    fs.mkdirSync(path.dirname(userDataPath()), { recursive: true });
    fs.writeFileSync(
      userDataPath(),
      typeof contents === 'string' ? contents : JSON.stringify(contents)
    );
  };

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-sdk-config-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('COMPOSIO_API_KEY', undefined);
    vi.stubEnv('COMPOSIO_BASE_URL', undefined);
    vi.stubEnv('COMPOSIO_USER_API_KEY', undefined);
    vi.stubEnv('COMPOSIO_ORG_API_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  describe('explicit project key', () => {
    it('wins over the environment and the user config file', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);
      writeUserData({ api_key: PROJECT_KEY });

      expect(getSDKConfig(undefined, EXPLICIT_KEY).apiKey).toBe(EXPLICIT_KEY);
    });

    it('still works when the user config file holds a CLI user key', () => {
      writeUserData({ api_key: USER_KEY });

      expect(getSDKConfig(undefined, EXPLICIT_KEY).apiKey).toBe(EXPLICIT_KEY);
    });
  });

  describe('omitted project key', () => {
    it('reads COMPOSIO_API_KEY before the user config file', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);
      writeUserData({ api_key: PROJECT_KEY });

      expect(getSDKConfig().apiKey).toBe(ENV_KEY);
    });

    it('treats an empty string like an omitted key', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);

      expect(getSDKConfig(undefined, '').apiKey).toBe(ENV_KEY);
    });

    it('falls back to a legacy project key stored in the user config file', () => {
      writeUserData({ api_key: PROJECT_KEY, base_url: 'https://disk.example.com' });

      expect(getSDKConfig()).toEqual({
        baseURL: 'https://disk.example.com',
        apiKey: PROJECT_KEY,
      });
    });

    it('keeps accepting stored keys with unfamiliar prefixes', () => {
      writeUserData({ api_key: 'legacy-format-key' });

      expect(getSDKConfig().apiKey).toBe('legacy-format-key');
    });

    it('prefers the environment when the user config file only holds a CLI user key', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);
      writeUserData({ api_key: USER_KEY });

      expect(getSDKConfig().apiKey).toBe(ENV_KEY);
    });

    it('rejects a CLI user key as the only candidate with a redacted kind error', () => {
      writeUserData({ api_key: USER_KEY });

      let caught: unknown;
      try {
        getSDKConfig();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ComposioAPIKeyKindError);
      const error = caught as ComposioAPIKeyKindError;
      expect(error.code).toContain(SDKErrorCodes.API_KEY_KIND_MISMATCH);
      expect(error.possibleFixes.length).toBeGreaterThan(0);
      const serialized = JSON.stringify({
        message: error.message,
        cause: error.cause,
        possibleFixes: error.possibleFixes,
        meta: error.meta,
      });
      expect(serialized).not.toContain(USER_KEY);
      expect(serialized).toContain('user_data.json');
      expect(serialized).toContain('user API key');
      expect(serialized).toContain('userApiKey');
    });

    it('does not let a configured user API key rescue an omitted project key', () => {
      // Omitting the project key keeps its historical meaning: the project key
      // is required. Only an explicit `null` opts into user-key-only auth.
      expect(() => getSDKConfig(undefined, undefined, { userApiKey: USER_KEY })).toThrow(
        ComposioNoAPIKeyError
      );
    });

    it('throws the no-key error when nothing is configured', () => {
      expect(() => getSDKConfig()).toThrow(ComposioNoAPIKeyError);
    });

    it('reports a malformed user config file without leaking its contents', () => {
      writeUserData('{"api_key": "' + PROJECT_KEY + '"'); // truncated JSON

      let caught: unknown;
      try {
        getSDKConfig();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ComposioNoAPIKeyError);
      const error = caught as ComposioNoAPIKeyError;
      expect(String(error.cause)).toContain(userDataPath());
      expect(String(error.cause)).toMatch(/could not be parsed/i);
      expect(String(error.cause)).not.toContain(PROJECT_KEY);
    });

    it('reports an unexpected user config shape without leaking its contents', () => {
      writeUserData({ api_key: { nested: PROJECT_KEY } });

      let caught: unknown;
      try {
        getSDKConfig();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ComposioNoAPIKeyError);
      const error = caught as ComposioNoAPIKeyError;
      expect(String(error.cause)).toContain(userDataPath());
      expect(String(error.cause)).toMatch(/unexpected shape/i);
      expect(String(error.cause)).not.toContain(PROJECT_KEY);
    });
  });

  describe('explicit null project key', () => {
    it('reads neither the environment nor the user config file', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);
      writeUserData({ api_key: PROJECT_KEY });

      let caught: unknown;
      try {
        getSDKConfig(undefined, null);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ComposioNoAPIKeyError);
      const error = caught as ComposioNoAPIKeyError;
      expect(error.message).toMatch(/disabled/i);
      expect(JSON.stringify(error.possibleFixes)).toContain('userApiKey');
      expect(JSON.stringify(error.possibleFixes)).toContain('x-user-api-key');
    });

    it('resolves to a null project key when a user API key option is configured', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);
      writeUserData({ api_key: PROJECT_KEY });

      expect(getSDKConfig(undefined, null, { userApiKey: USER_KEY })).toEqual({
        baseURL: DEFAULT_BASE_URL,
        apiKey: null,
      });
    });

    it('resolves to a null project key when an organization API key option is configured', () => {
      expect(getSDKConfig(undefined, null, { orgApiKey: ORG_KEY }).apiKey).toBeNull();
    });

    it('accepts the user API key the client will read from COMPOSIO_USER_API_KEY', () => {
      vi.stubEnv('COMPOSIO_USER_API_KEY', USER_KEY);

      expect(getSDKConfig(undefined, null).apiKey).toBeNull();
    });

    it('accepts the organization API key the client will read from COMPOSIO_ORG_API_KEY', () => {
      vi.stubEnv('COMPOSIO_ORG_API_KEY', ORG_KEY);

      expect(getSDKConfig(undefined, null).apiKey).toBeNull();
    });

    it('does not read COMPOSIO_USER_API_KEY when the user API key option is null', () => {
      vi.stubEnv('COMPOSIO_USER_API_KEY', USER_KEY);

      expect(() => getSDKConfig(undefined, null, { userApiKey: null })).toThrow(
        ComposioNoAPIKeyError
      );
    });

    it('does not accept an empty user API key option', () => {
      expect(() => getSDKConfig(undefined, null, { userApiKey: '' })).toThrow(
        ComposioNoAPIKeyError
      );
    });

    it('resolves to a null project key when a user API key header is configured', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);
      writeUserData({ api_key: PROJECT_KEY });

      expect(
        getSDKConfig(undefined, null, { defaultHeaders: { 'x-user-api-key': USER_KEY } })
      ).toEqual({ baseURL: DEFAULT_BASE_URL, apiKey: null });
    });

    it('matches the user API key header name case-insensitively', () => {
      expect(
        getSDKConfig(undefined, null, { defaultHeaders: { 'X-User-Api-Key': USER_KEY } }).apiKey
      ).toBeNull();
    });

    it('does not accept an empty user API key header', () => {
      expect(() =>
        getSDKConfig(undefined, null, { defaultHeaders: { 'x-user-api-key': '' } })
      ).toThrow(ComposioNoAPIKeyError);
    });

    it('does not treat other default headers as a credential', () => {
      expect(() =>
        getSDKConfig(undefined, null, { defaultHeaders: { 'x-api-key': PROJECT_KEY } })
      ).toThrow(ComposioNoAPIKeyError);
    });
  });

  describe('base URL', () => {
    it('prefers the explicit value, then the environment, then the user config file', () => {
      vi.stubEnv('COMPOSIO_BASE_URL', 'https://env.example.com');
      writeUserData({ api_key: PROJECT_KEY, base_url: 'https://disk.example.com' });

      expect(getSDKConfig('https://explicit.example.com', EXPLICIT_KEY).baseURL).toBe(
        'https://explicit.example.com'
      );
      expect(getSDKConfig(undefined, EXPLICIT_KEY).baseURL).toBe('https://env.example.com');

      vi.stubEnv('COMPOSIO_BASE_URL', undefined);
      expect(getSDKConfig(undefined, EXPLICIT_KEY).baseURL).toBe('https://disk.example.com');
    });

    it('falls back to the default base URL', () => {
      expect(getSDKConfig(undefined, EXPLICIT_KEY).baseURL).toBe(DEFAULT_BASE_URL);
    });
  });
});

describe('resolveCredentialHeaders', () => {
  it('prefers the x-user-api-key default header over the configured keys', () => {
    expect(
      resolveCredentialHeaders({
        apiKey: PROJECT_KEY,
        userApiKey: USER_KEY,
        defaultHeaders: { 'X-User-Api-Key': 'uak_headerKey' },
      })
    ).toEqual({ 'x-user-api-key': 'uak_headerKey' });
  });

  it('sends the project key when no credential header is placed', () => {
    expect(
      resolveCredentialHeaders({ apiKey: PROJECT_KEY, userApiKey: USER_KEY, defaultHeaders: {} })
    ).toEqual({ 'x-api-key': PROJECT_KEY });
  });

  it('sends the resolved user key when the project key is disabled', () => {
    expect(
      resolveCredentialHeaders({ apiKey: null, userApiKey: USER_KEY, defaultHeaders: undefined })
    ).toEqual({ 'x-user-api-key': USER_KEY });
  });

  it('ignores an empty credential header and returns nothing without a credential', () => {
    expect(
      resolveCredentialHeaders({
        apiKey: null,
        userApiKey: null,
        defaultHeaders: { 'x-user-api-key': '' },
      })
    ).toEqual({});
  });
});
