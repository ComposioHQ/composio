import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Auth } from '@composio/client';
import {
  getSDKConfig,
  getUserApiKeyHeader,
  resolveCredentialHeaders,
  resolveSDKCredentials,
  toClientAuth,
  toClientScope,
  withoutSDKOwnedHeaders,
} from '../../src/utils/sdk';
import { ComposioError } from '../../src/errors/ComposioError';
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

    it('resolves to a null project key when an organization API key header is configured', () => {
      vi.stubEnv('COMPOSIO_API_KEY', ENV_KEY);

      expect(
        getSDKConfig(undefined, null, { defaultHeaders: { 'X-Org-Api-Key': 'oak_headerKey' } })
      ).toEqual({ baseURL: DEFAULT_BASE_URL, apiKey: null });
      expect(() =>
        getSDKConfig(undefined, null, { defaultHeaders: { 'x-org-api-key': '' } })
      ).toThrow(ComposioNoAPIKeyError);
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
        getSDKConfig(undefined, null, {
          defaultHeaders: { authorization: `Bearer ${PROJECT_KEY}` },
        })
      ).toThrow(ComposioNoAPIKeyError);
    });

    it('rejects a raw project key header even when a user API key is configured', () => {
      let caught: unknown;
      try {
        getSDKConfig(undefined, null, {
          userApiKey: USER_KEY,
          defaultHeaders: { 'x-api-key': PROJECT_KEY },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ComposioNoAPIKeyError);
      const error = caught as ComposioNoAPIKeyError;
      expect(error.message).toBe(
        'Project API key resolution is disabled, but `defaultHeaders` carries a `x-api-key` entry'
      );
      expect(error.possibleFixes[0]).toBe(
        'Pass the project API key via `apiKey` instead of a raw `x-api-key` default header'
      );
      expect(JSON.stringify(error)).not.toContain(PROJECT_KEY);
    });

    it('matches a raw project key header name case-insensitively', () => {
      expect(() =>
        getSDKConfig(undefined, null, {
          defaultHeaders: { 'X-Api-Key': PROJECT_KEY, 'x-user-api-key': USER_KEY },
        })
      ).toThrow(
        'Project API key resolution is disabled, but `defaultHeaders` carries a `X-Api-Key` entry'
      );
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

describe('getUserApiKeyHeader', () => {
  it('matches the header name case-insensitively and keeps the original key', () => {
    expect(getUserApiKeyHeader({ 'X-User-Api-Key': USER_KEY })).toEqual({
      name: 'X-User-Api-Key',
      value: USER_KEY,
    });
  });

  it('ignores a header whose value is not a non-empty string', () => {
    const untyped = (value: unknown) =>
      ({ 'x-user-api-key': value }) as unknown as Record<string, string>;

    expect(getUserApiKeyHeader(untyped(''))).toBeUndefined();
    expect(getUserApiKeyHeader(untyped(undefined))).toBeUndefined();
    expect(getUserApiKeyHeader(untyped(null))).toBeUndefined();
    expect(getUserApiKeyHeader(untyped(42))).toBeUndefined();
    expect(getUserApiKeyHeader(untyped([USER_KEY]))).toBeUndefined();
    expect(getUserApiKeyHeader(undefined)).toBeUndefined();
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

  it('sends the organization key only when no project or user key is held', () => {
    expect(
      resolveCredentialHeaders({
        apiKey: null,
        userApiKey: null,
        orgApiKey: 'oak_orgKey',
        defaultHeaders: undefined,
      })
    ).toEqual({ 'x-org-api-key': 'oak_orgKey' });
    expect(
      resolveCredentialHeaders({
        apiKey: null,
        userApiKey: USER_KEY,
        orgApiKey: 'oak_orgKey',
        defaultHeaders: undefined,
      })
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

describe('resolveSDKCredentials', () => {
  beforeEach(() => {
    vi.stubEnv('COMPOSIO_USER_API_KEY', undefined);
    vi.stubEnv('COMPOSIO_ORG_API_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the resolved project key and the explicit alternate keys', () => {
    expect(
      resolveSDKCredentials({ apiKey: PROJECT_KEY, userApiKey: USER_KEY, orgApiKey: ORG_KEY })
    ).toEqual({ apiKey: PROJECT_KEY, userApiKey: USER_KEY, orgApiKey: ORG_KEY });
  });

  it('falls back to the environment for omitted alternate keys, and not for null ones', () => {
    vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_env');
    vi.stubEnv('COMPOSIO_ORG_API_KEY', 'oak_env');

    expect(resolveSDKCredentials({ apiKey: PROJECT_KEY })).toEqual({
      apiKey: PROJECT_KEY,
      userApiKey: 'uak_env',
      orgApiKey: 'oak_env',
    });
    expect(
      resolveSDKCredentials({ apiKey: PROJECT_KEY, userApiKey: null, orgApiKey: null })
    ).toEqual({ apiKey: PROJECT_KEY, userApiKey: null, orgApiKey: null });
  });

  it('folds an x-user-api-key header in as the only user credential', () => {
    expect(
      resolveSDKCredentials({
        apiKey: PROJECT_KEY,
        userApiKey: 'uak_option',
        orgApiKey: ORG_KEY,
        defaultHeaders: { 'X-User-Api-Key': USER_KEY },
      })
    ).toEqual({ apiKey: null, userApiKey: USER_KEY, orgApiKey: ORG_KEY });
  });

  it('folds an x-org-api-key header in as the only credential', () => {
    expect(
      resolveSDKCredentials({
        apiKey: PROJECT_KEY,
        userApiKey: USER_KEY,
        defaultHeaders: { 'x-org-api-key': ORG_KEY },
      })
    ).toEqual({ apiKey: null, userApiKey: null, orgApiKey: ORG_KEY });
  });

  it('folds an x-api-key header in as the project key', () => {
    expect(
      resolveSDKCredentials({
        apiKey: EXPLICIT_KEY,
        userApiKey: USER_KEY,
        defaultHeaders: { 'x-api-key': PROJECT_KEY },
      })
    ).toEqual({ apiKey: PROJECT_KEY, userApiKey: USER_KEY, orgApiKey: null });
  });

  it('ignores empty credential headers', () => {
    expect(
      resolveSDKCredentials({
        apiKey: PROJECT_KEY,
        defaultHeaders: { 'x-user-api-key': '', 'x-org-api-key': '' },
      })
    ).toEqual({ apiKey: PROJECT_KEY, userApiKey: null, orgApiKey: null });
  });

  it('rejects two credential headers without echoing either value', () => {
    const resolve = () =>
      resolveSDKCredentials({
        apiKey: PROJECT_KEY,
        defaultHeaders: { 'x-user-api-key': USER_KEY, 'X-Org-Api-Key': ORG_KEY },
      });

    expect(resolve).toThrow(ComposioError);
    expect(resolve).toThrow('`defaultHeaders` carries more than one credential header');
    const error = (() => {
      try {
        resolve();
      } catch (caught) {
        return caught as ComposioError;
      }
    })();
    expect(JSON.stringify({ message: error?.message, cause: error?.cause })).not.toMatch(
      /uak_|oak_/
    );
  });
});

describe('toClientAuth', () => {
  it.each([
    [
      'a project key alone',
      { apiKey: PROJECT_KEY, userApiKey: null, orgApiKey: null },
      Auth.project(PROJECT_KEY),
    ],
    [
      'a project key and a user key',
      { apiKey: PROJECT_KEY, userApiKey: USER_KEY, orgApiKey: null },
      Auth.auto({ project: PROJECT_KEY, user: USER_KEY }),
    ],
    [
      'a project key and an organization key',
      { apiKey: PROJECT_KEY, userApiKey: null, orgApiKey: ORG_KEY },
      Auth.auto({ project: PROJECT_KEY, organization: ORG_KEY }),
    ],
    [
      'all three keys',
      { apiKey: PROJECT_KEY, userApiKey: USER_KEY, orgApiKey: ORG_KEY },
      Auth.auto({ project: PROJECT_KEY, user: USER_KEY, organization: ORG_KEY }),
    ],
    [
      'a user key without a project key',
      { apiKey: null, userApiKey: USER_KEY, orgApiKey: null },
      Auth.user(USER_KEY),
    ],
    [
      'a user and an organization key without a project key',
      { apiKey: null, userApiKey: USER_KEY, orgApiKey: ORG_KEY },
      Auth.user(USER_KEY),
    ],
    [
      'an organization key alone',
      { apiKey: null, userApiKey: null, orgApiKey: ORG_KEY },
      Auth.organization(ORG_KEY),
    ],
  ])('maps %s', (_name, credentials, expected) => {
    expect(toClientAuth(credentials)).toEqual(expected);
  });

  it('refuses to build auth without any credential', () => {
    expect(() => toClientAuth({ apiKey: null, userApiKey: null, orgApiKey: null })).toThrow(
      ComposioNoAPIKeyError
    );
  });
});

describe('toClientScope', () => {
  it('maps a resolved scope to the client scope', () => {
    expect(toClientScope({ orgId: 'org_1', projectId: 'proj_1' })).toEqual({
      organizationId: 'org_1',
      projectId: 'proj_1',
    });
  });

  it('leaves an unscoped instance unscoped', () => {
    expect(toClientScope({})).toBeUndefined();
  });
});

describe('withoutSDKOwnedHeaders', () => {
  it('drops credential and scope headers in any letter case and keeps the rest', () => {
    expect(
      withoutSDKOwnedHeaders({
        'X-Api-Key': PROJECT_KEY,
        'x-user-api-key': USER_KEY,
        'X-ORG-API-KEY': ORG_KEY,
        'x-org-id': 'org_1',
        'X-Project-Id': 'proj_1',
        'x-request-id': 'req-1',
      })
    ).toEqual({ 'x-request-id': 'req-1' });
  });

  it('keeps undefined as undefined', () => {
    expect(withoutSDKOwnedHeaders(undefined)).toBeUndefined();
  });
});
