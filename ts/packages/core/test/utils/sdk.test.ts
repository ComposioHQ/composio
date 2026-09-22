import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getSDKConfig } from '../../src/utils/sdk';
import {
  ComposioAPIKeyKindError,
  ComposioNoAPIKeyError,
  SDKErrorCodes,
} from '../../src/errors/SDKErrors';
import { DEFAULT_BASE_URL } from '../../src/utils/constants';

const USER_KEY = 'uak_cliUserKeyValue';
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
      expect(JSON.stringify(error.possibleFixes)).toContain('x-user-api-key');
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

    it('does not accept a user API key header whose value is not a string', () => {
      expect(() =>
        getSDKConfig(undefined, null, {
          defaultHeaders: { 'x-user-api-key': undefined as unknown as string },
        })
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
