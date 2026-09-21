import { afterEach, describe, expect, it, vi } from 'vitest';

const platformMock = vi.hoisted(() => ({
  supportsFileSystem: false,
  homedir: vi.fn(() => null),
  joinPath: vi.fn((...segments: string[]) => segments.join('/')),
  readFileSync: vi.fn(() => {
    throw new Error('File system operations are not supported in this runtime environment');
  }),
}));

vi.mock('#platform', () => ({ platform: platformMock }));

import { getSDKConfig } from '../../src/utils/sdk';
import { ComposioNoAPIKeyError } from '../../src/errors/SDKErrors';

describe('getSDKConfig on edge runtimes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('never touches file system APIs when resolving an omitted key', () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_envKeyValue');

    expect(getSDKConfig().apiKey).toBe('ak_envKeyValue');
    expect(platformMock.homedir).not.toHaveBeenCalled();
    expect(platformMock.readFileSync).not.toHaveBeenCalled();
  });

  it('throws the no-key error without touching file system APIs', () => {
    vi.stubEnv('COMPOSIO_API_KEY', undefined);

    expect(() => getSDKConfig()).toThrow(ComposioNoAPIKeyError);
    expect(platformMock.homedir).not.toHaveBeenCalled();
    expect(platformMock.readFileSync).not.toHaveBeenCalled();
  });

  it('never touches file system APIs when the project key is disabled', () => {
    vi.stubEnv('COMPOSIO_API_KEY', 'ak_envKeyValue');

    expect(
      getSDKConfig('https://explicit.example.com', null, {
        defaultHeaders: { 'x-user-api-key': 'uak_userKeyValue' },
      })
    ).toEqual({ baseURL: 'https://explicit.example.com', apiKey: null });
    expect(platformMock.homedir).not.toHaveBeenCalled();
    expect(platformMock.readFileSync).not.toHaveBeenCalled();
  });
});
