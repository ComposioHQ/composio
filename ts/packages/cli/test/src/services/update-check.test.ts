import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { withHttpServer } from 'test/__utils__/http-server';
import {
  createUpdateChecker,
  parseLatestVersionFromRefs,
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
    refsUrl: 'http://unused.test',
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

/** Create a GitHub matching-refs response body. */
function makeRefsPayload(versions: string[]) {
  return versions.map(v => ({
    ref: `refs/tags/@composio/cli@${v}`,
    node_id: 'unused',
    url: 'unused',
    object: { sha: 'abc', type: 'tag', url: 'unused' },
  }));
}

// ── parseLatestVersionFromRefs (pure) ───────────────────────────────────

describe('parseLatestVersionFromRefs', () => {
  it('returns undefined for non-array input', () => {
    expect(parseLatestVersionFromRefs(null)).toBeUndefined();
    expect(parseLatestVersionFromRefs('string')).toBeUndefined();
    expect(parseLatestVersionFromRefs(42)).toBeUndefined();
  });

  it('returns undefined when no refs match the CLI pattern', () => {
    const refs = [
      { ref: 'refs/tags/@composio/core@1.0.0' },
      { ref: 'refs/tags/v1.0.0' },
      { ref: 'refs/heads/main' },
    ];
    expect(parseLatestVersionFromRefs(refs)).toBeUndefined();
  });

  it('returns the single matching version', () => {
    const refs = makeRefsPayload(['0.2.1']);
    expect(parseLatestVersionFromRefs(refs)).toBe('0.2.1');
  });

  it('returns the highest semver, not the last element', () => {
    // GitHub returns refs sorted lexicographically — 0.10.0 < 0.9.0 lexically
    // but 0.10.0 > 0.9.0 in semver.
    const refs = makeRefsPayload(['0.1.0', '0.10.0', '0.9.0', '0.2.0']);
    expect(parseLatestVersionFromRefs(refs)).toBe('0.10.0');
  });

  it('excludes prerelease tags', () => {
    const refs = [
      { ref: 'refs/tags/@composio/cli@0.2.0' },
      { ref: 'refs/tags/@composio/cli@0.3.0-beta.1' },
    ];
    expect(parseLatestVersionFromRefs(refs)).toBe('0.2.0');
  });

  it('skips malformed ref objects', () => {
    const refs = [
      null,
      42,
      { noRef: true },
      { ref: 123 },
      { ref: 'refs/tags/@composio/cli@0.5.0' },
    ];
    expect(parseLatestVersionFromRefs(refs)).toBe('0.5.0');
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
        json: () => Promise.resolve(makeRefsPayload(['0.3.0'])),
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
        json: () => Promise.resolve(makeRefsPayload(['0.4.0', '0.3.0'])),
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
        json: () => Promise.resolve(makeRefsPayload(['0.5.0'])),
      }) as unknown as typeof fetch,
    });
    mkdirSync(dirname(config.stateFile), { recursive: true });
    writeFileSync(config.stateFile, 'garbage');
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.latestVersion).toBe('0.5.0');
  });

  it('still writes lastChecked when no CLI tags are found', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ ref: 'refs/tags/@composio/core@1.0.0' }]),
      }) as unknown as typeof fetch,
    });
    const { checkForUpdate } = createUpdateChecker(config);

    await checkForUpdate();

    expect(existsSync(config.stateFile)).toBe(true);
    const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
    expect(state.lastChecked).toBeDefined();
    // Falls back to currentVersion since no previous state and no tags found
    expect(state.latestVersion).toBe(config.currentVersion);
  });

  it('preserves previous latestVersion when no CLI tags are found', async () => {
    const config = makeConfig({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ ref: 'refs/tags/@composio/core@1.0.0' }]),
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
      json: () => Promise.resolve(makeRefsPayload(['0.2.1'])),
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
      json: () => Promise.resolve(makeRefsPayload(['0.2.1'])),
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
        res.end(JSON.stringify(makeRefsPayload(['0.1.26', '0.2.0', '0.2.1'])));
      },
      async baseUrl => {
        const config = makeConfig({ refsUrl: baseUrl, fetchFn: fetch });
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
        res.end(JSON.stringify(makeRefsPayload(['0.2.1'])));
      },
      async baseUrl => {
        const config = makeConfig({
          refsUrl: baseUrl,
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
