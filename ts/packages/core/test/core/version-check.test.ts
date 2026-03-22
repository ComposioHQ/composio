import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForLatestVersionFromNPM } from '../../src/utils/version';

const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('checkForLatestVersionFromNPM - version cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT call fetch when cache is fresh (<24h)', async () => {
    const freshTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ version: '1.0.0', timestamp: freshTimestamp })
    );

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should call fetch and update cache when cache is stale (>24h)', async () => {
    const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ version: '1.0.0', timestamp: staleTimestamp })
    );
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.1.0' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('composio-version-cache.json'),
      expect.stringContaining('"version":"1.1.0"')
    );
  });

  it('should call fetch and write cache when cache file does not exist', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.0.0' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('composio-version-cache.json'),
      expect.stringContaining('"version":"1.0.0"')
    );
  });

  it('should treat corrupt/malformed JSON as cache miss', async () => {
    mockReadFileSync.mockReturnValue('not valid json {{{');
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.0.0' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should not throw when writeFileSync fails (permission error)', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: '1.0.0' }),
    });
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await expect(checkForLatestVersionFromNPM('0.9.0')).resolves.not.toThrow();
  });

  it('should not write cache when npm response has no valid version', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: undefined }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should not write cache when npm response version is not valid semver', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ version: 'not-a-version' }),
    });

    await checkForLatestVersionFromNPM('0.9.0');

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
