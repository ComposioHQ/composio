import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPlatform = vi.hoisted(() => ({
  supportsFileSystem: true,
  homedir: vi.fn().mockReturnValue('/mock-home'),
  joinPath: vi.fn((...paths: string[]) => paths.join('/')),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  basename: vi.fn(),
}));

vi.mock('#platform', () => ({
  platform: mockPlatform,
}));

import { checkForLatestVersionFromNPM } from '../../src/utils/version';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('checkForLatestVersionFromNPM - version cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.supportsFileSystem = true;
    mockPlatform.homedir.mockReturnValue('/mock-home');
    mockPlatform.existsSync.mockReturnValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT call fetch when cache is fresh (<24h)', async () => {
    const freshTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
    mockPlatform.readFileSync.mockReturnValue(
      JSON.stringify({ version: '1.0.0', timestamp: freshTimestamp })
    );

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should call fetch and update cache when cache is stale (>24h)', async () => {
    const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    mockPlatform.readFileSync.mockReturnValue(
      JSON.stringify({ version: '1.0.0', timestamp: staleTimestamp })
    );
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.1.0' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockPlatform.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('version-cache.json'),
      expect.stringContaining('"version":"1.1.0"'),
      'utf8'
    );
  });

  it('should call fetch and write cache when cache file does not exist', async () => {
    mockPlatform.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.0.0' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockPlatform.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('version-cache.json'),
      expect.stringContaining('"version":"1.0.0"'),
      'utf8'
    );
  });

  it('should treat corrupt/malformed JSON as cache miss', async () => {
    mockPlatform.readFileSync.mockReturnValue('not valid json {{{');
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.0.0' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should not throw when writeFileSync fails (permission error)', async () => {
    mockPlatform.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.0.0' }),
    });
    mockPlatform.writeFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await expect(checkForLatestVersionFromNPM('0.9.0')).resolves.not.toThrow();
  });

  it('should not write cache when npm response has no valid version', async () => {
    mockPlatform.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: undefined }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockPlatform.writeFileSync).not.toHaveBeenCalled();
  });

  it('should not write cache when npm response version is not valid semver', async () => {
    mockPlatform.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: 'not-a-version' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockPlatform.writeFileSync).not.toHaveBeenCalled();
  });

  it('should skip cache operations when platform does not support file system', async () => {
    mockPlatform.supportsFileSystem = false;
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.0.0' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockPlatform.readFileSync).not.toHaveBeenCalled();
    expect(mockPlatform.writeFileSync).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
