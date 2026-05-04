import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { withHttpServer } from 'test/__utils__/http-server';
import {
  createUpdateChecker,
  parseLatestVersionFromReleases,
  type UpdateCheckConfig,
  type UpdateCheckState,
} from 'src/services/update-check';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a temp directory that is cleaned up after each test. */
let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'update-check-test-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Build a test config pointing at a temp directory with optional overrides. */
function makeConfig(overrides?: Partial<UpdateCheckConfig>): UpdateCheckConfig {
  return {
    stateFile: join(tempDir, '.composio', 'update-check.json'),
    currentVersion: '0.2.0',
    checkIntervalMs: 24 * 60 * 60 * 1000,
    releasesUrl: 'http://unused.test',
    binaryAssetName: 'composio-darwin-aarch64.zip',
    accessToken: undefined,
    fetchFn: () => Promise.reject(new Error('fetch not configured')),
    ...overrides,
  };
}

/** Write a state file to the test config's stateFile path. */
function writeState(config: UpdateCheckConfig, state: UpdateCheckState): void {
  mkdirSync(dirname(config.stateFile), { recursive: true });
  writeFileSync(config.stateFile, JSON.stringify(state));
}

/** Create a GitHub releases response body. */
function makeReleasesPayload(versions: string[], assetName = 'composio-darwin-aarch64.zip') {
  return versions.map(v => ({
    tag_name: `@composio/cli@${v}`,
    prerelease: v.includes('-'),
    draft: false,
    assets: [{ name: assetName, browser_download_url: 'unused' }],
  }));
}

// ── parseLatestVersionFromReleases (pure) ───────────────────────────────

describe('parseLatestVersionFromReleases', () => {
  const binaryAssetName = 'composio-darwin-aarch64.zip';

  it('returns undefined for non-array input', () => {
    expect(parseLatestVersionFromReleases(null, binaryAssetName)).toBeUndefined();
    expect(parseLatestVersionFromReleases('string', binaryAssetName)).toBeUndefined();
    expect(parseLatestVersionFromReleases(42, binaryAssetName)).toBeUndefined();
  });

  it('returns undefined when no releases match the CLI pattern', () => {
    const releases = [
      { tag_name: '@composio/core@1.0.0', assets: [{ name: binaryAssetName }] },
      { tag_name: 'v1.0.0', assets: [{ name: binaryAssetName }] },
      { tag_name: '@composio/cli@0.2.0-beta.1', assets: [{ name: binaryAssetName }] },
    ];
    expect(parseLatestVersionFromReleases(releases, binaryAssetName)).toBeUndefined();
  });

  it('returns the single matching version', () => {
    const releases = makeReleasesPayload(['0.2.1']);
    expect(parseLatestVersionFromReleases(releases, binaryAssetName)).toBe('0.2.1');
  });

  it('returns the highest semver, not the first element', () => {
    const releases = makeReleasesPayload(['0.1.0', '0.10.0', '0.9.0', '0.2.0']);
    expect(parseLatestVersionFromReleases(releases, binaryAssetName)).toBe('0.10.0');
  });

  it('excludes prerelease and draft releases', () => {
    const releases = [
      ...makeReleasesPayload(['0.2.0']),
      {
        tag_name: '@composio/cli@0.3.0',
        prerelease: true,
        draft: false,
        assets: [{ name: binaryAssetName }],
      },
      {
        tag_name: '@composio/cli@0.4.0',
        prerelease: false,
        draft: true,
        assets: [{ name: binaryAssetName }],
      },
    ];
    expect(parseLatestVersionFromReleases(releases, binaryAssetName)).toBe('0.2.0');
  });

  it('requires the platform binary asset', () => {
    const releases = [
      ...makeReleasesPayload(['0.4.0'], 'composio-linux-x64.zip'),
      ...makeReleasesPayload(['0.3.0']),
    ];
    expect(parseLatestVersionFromReleases(releases, binaryAssetName)).toBe('0.3.0');
  });

  it('returns undefined when no binary asset name is known', () => {
    expect(
      parseLatestVersionFromReleases(makeReleasesPayload(['0.2.1']), undefined)
    ).toBeUndefined();
  });

  it('skips malformed release objects', () => {
    const releases = [
      null,
      42,
      { noTagName: true },
      { tag_name: 123 },
      { tag_name: '@composio/cli@0.5.0' },
      { tag_name: '@composio/cli@0.6.0', assets: [{ noName: true }] },
      { tag_name: '@composio/cli@0.7.0', assets: [{ name: binaryAssetName }] },
    ];
    expect(parseLatestVersionFromReleases(releases, binaryAssetName)).toBe('0.7.0');
  });
});

// ── showUpdateNotice ────────────────────────────────────────────────────

describe('showUpdateNotice', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('does nothing when no state file exists', () => {
    const { showUpdateNotice } = createUpdateChecker(makeConfig());

    showUpdateNotice();

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does nothing when cached version equals current version', () => {
    const config = makeConfig({ currentVersion: '0.2.0' });
    writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.2.0' });
    const { showUpdateNotice } = createUpdateChecker(config);

    showUpdateNotice();

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does nothing when cached version is older than current', () => {
    const config = makeConfig({ currentVersion: '0.3.0' });
    writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.2.0' });
    const { showUpdateNotice } = createUpdateChecker(config);

    showUpdateNotice();

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('prints upgrade hint when cached version is newer', () => {
    const config = makeConfig({ currentVersion: '0.2.0' });
    writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.3.0' });
    const { showUpdateNotice } = createUpdateChecker(config);

    showUpdateNotice();

    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('Update available');
    expect(output).toContain('0.3.0');
    expect(output).toContain('composio upgrade');
  });

  it('silently ignores corrupt state file', () => {
    const config = makeConfig();
    mkdirSync(dirname(config.stateFile), { recursive: true });
    writeFileSync(config.stateFile, 'not-json!!!');
    const { showUpdateNotice } = createUpdateChecker(config);

    showUpdateNotice();

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does nothing when cached version is not valid semver', () => {
    const config = makeConfig({ currentVersion: '0.2.0' });
    writeState(config, { lastChecked: new Date().toISOString(), latestVersion: 'not-semver' });
    const { showUpdateNotice } = createUpdateChecker(config);

    showUpdateNotice();

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

// ── checkForUpdate ──────────────────────────────────────────────────────

describe('checkForUpdate', () => {
  it('skips fetch when cache is fresh', () => {
    const fetchFn = vi.fn();
    const config = makeConfig({ fetchFn: fetchFn as unknown as typeof fetch });
    writeState(config, {
      lastChecked: new Date().toISOString(),
      latestVersion: '0.2.0',
    });
    const { checkForUpdate } = createUpdateChecker(config);

    const result = checkForUpdate();

    expect(result).toBeUndefined(); // returned early, no promise
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches when cache is stale', async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeReleasesPayload(['0.3.0'])),
      }) as unknown as typeof fetch,
    });
    writeState(config, { lastChecked: stale, latestVersion: '0.2.0' });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    expect(config.fetchFn).toHaveBeenCalledOnce();
    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.latestVersion).toBe('0.3.0');
  });

  it('fetches when no cache exists', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeReleasesPayload(['0.4.0', '0.3.0'])),
      }) as unknown as typeof fetch,
    });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    expect(existsSync(config.stateFile)).toBe(true);
    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.latestVersion).toBe('0.4.0');
  });

  it('fetches when cache file is corrupt', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeReleasesPayload(['0.5.0'])),
      }) as unknown as typeof fetch,
    });
    mkdirSync(dirname(config.stateFile), { recursive: true });
    writeFileSync(config.stateFile, 'garbage');
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.latestVersion).toBe('0.5.0');
  });

  it('still writes lastChecked when no CLI releases with the required binary are found', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { tag_name: '@composio/core@1.0.0', assets: [{ name: 'composio-darwin-aarch64.zip' }] },
          ]),
      }) as unknown as typeof fetch,
    });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    expect(existsSync(config.stateFile)).toBe(true);
    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.lastChecked).toBeDefined();
    // Falls back to currentVersion since no previous state and no matching releases found
    expect(state.latestVersion).toBe(config.currentVersion);
  });

  it('preserves previous latestVersion when no CLI releases with the required binary are found', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { tag_name: '@composio/core@1.0.0', assets: [{ name: 'composio-darwin-aarch64.zip' }] },
          ]),
      }) as unknown as typeof fetch,
    });
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeState(config, { lastChecked: stale, latestVersion: '0.3.0' });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.latestVersion).toBe('0.3.0');
    expect(new Date(state.lastChecked).getTime()).toBeGreaterThan(new Date(stale).getTime());
  });

  it('writes lastChecked on HTTP errors to prevent retry loops', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as unknown as typeof fetch,
    });
    const { checkForUpdate } = createUpdateChecker(config);

    // Should not throw
    await checkForUpdate();

    expect(existsSync(config.stateFile)).toBe(true);
    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.lastChecked).toBeDefined();
    expect(state.latestVersion).toBe(config.currentVersion);
  });

  it('writes lastChecked on network errors to prevent retry loops', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockRejectedValue(new Error('DNS failed')) as unknown as typeof fetch,
    });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    expect(existsSync(config.stateFile)).toBe(true);
    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.lastChecked).toBeDefined();
    expect(state.latestVersion).toBe(config.currentVersion);
  });

  it('sends Authorization header when accessToken is set', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeReleasesPayload(['0.2.1'])),
    });
    const config = makeConfig({
      accessToken: 'ghp_secret123',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    expect(fetchFn).toHaveBeenCalledOnce();
    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer ghp_secret123');
  });

  it('does not send Authorization header when accessToken is undefined', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeReleasesPayload(['0.2.1'])),
    });
    const config = makeConfig({
      accessToken: undefined,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

// ── Integration: real HTTP server ───────────────────────────────────────

describe('checkForUpdate with real HTTP', () => {
  it('fetches from a real server and writes state', async () => {
    await withHttpServer(
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(makeReleasesPayload(['0.1.26', '0.2.0', '0.2.1'])));
      },
      async baseUrl => {
        const config = makeConfig({ releasesUrl: baseUrl, fetchFn: fetch });
        const { checkForUpdate } = createUpdateChecker(config);

        await checkForUpdate();

        const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
        expect(state.latestVersion).toBe('0.2.1');
      }
    );
  });

  it('passes Authorization header to the server', async () => {
    let receivedAuth: string | undefined;

    await withHttpServer(
      (req, res) => {
        receivedAuth = req.headers.authorization;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(makeReleasesPayload(['0.2.1'])));
      },
      async baseUrl => {
        const config = makeConfig({
          releasesUrl: baseUrl,
          accessToken: 'ghp_test_token',
          fetchFn: fetch,
        });
        const { checkForUpdate } = createUpdateChecker(config);

        await checkForUpdate();

        expect(receivedAuth).toBe('Bearer ghp_test_token');
      }
    );
  });
});
