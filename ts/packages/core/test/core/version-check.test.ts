import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/utils/logger';
import {
  checkForLatestVersionFromGitHub,
  parseLatestVersionFromGitHubReleases,
} from '../../src/utils/version';

describe('parseLatestVersionFromGitHubReleases', () => {
  it('returns undefined for non-array input', () => {
    expect(parseLatestVersionFromGitHubReleases(null)).toBeUndefined();
    expect(parseLatestVersionFromGitHubReleases('not-an-array')).toBeUndefined();
  });

  it('returns the highest stable @composio/core release version', () => {
    expect(
      parseLatestVersionFromGitHubReleases([
        { tag_name: '@composio/core@0.9.0', prerelease: false, draft: false },
        { tag_name: '@composio/core@0.10.0', prerelease: false, draft: false },
        { tag_name: '@composio/core@0.11.0-beta.1', prerelease: true, draft: false },
        { tag_name: '@composio/cli@9.9.9', prerelease: false, draft: false },
      ])
    ).toBe('0.10.0');
  });

  it('ignores malformed releases', () => {
    expect(
      parseLatestVersionFromGitHubReleases([
        null,
        42,
        { tag_name: 123 },
        { tag_name: '@composio/core@invalid', prerelease: false, draft: false },
      ])
    ).toBeUndefined();
  });
});

describe('checkForLatestVersionFromGitHub', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('logs when a newer stable GitHub release is available', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { tag_name: '@composio/core@1.2.0', prerelease: false, draft: false },
          { tag_name: '@composio/core@1.1.0', prerelease: false, draft: false },
        ]),
    }) as unknown as typeof fetch;

    await checkForLatestVersionFromGitHub('1.0.0');

    expect(infoSpy).toHaveBeenCalledWith(
      '🚀 Upgrade available! Your composio-core version (1.0.0) is behind. Latest version: 1.2.0.'
    );
  });

  it('does not log when GitHub returns no matching stable core release', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { tag_name: '@composio/core@1.2.0-beta.1', prerelease: true, draft: false },
          { tag_name: '@composio/cli@1.2.0', prerelease: false, draft: false },
        ]),
    }) as unknown as typeof fetch;

    await checkForLatestVersionFromGitHub('1.0.0');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('does not log when the GitHub request fails', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await checkForLatestVersionFromGitHub('1.0.0');

    expect(infoSpy).not.toHaveBeenCalled();
  });
});
