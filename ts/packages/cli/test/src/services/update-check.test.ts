import { describe, it, expect, vi, beforeEach, afterEach } from '@effect/vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Fiber, Layer } from 'effect';
import { withHttpServerEffect } from 'test/__utils__/http-server';
import { getTerminalCapabilities, type TerminalUI } from 'src/services/terminal-ui';
import {
  createUpdateChecker,
  parseLatestVersionFromReleases,
  type UpdateCheckConfig,
  type UpdateCheckState,
} from 'src/services/update-check';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Platform services required by the update checker's Effects. */
const PlatformLayers = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

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

const makeTerminal = (
  output: string[],
  tty: { stdin: boolean; stdout: boolean; stderr: boolean } = {
    stdin: true,
    stdout: true,
    stderr: true,
  }
): Pick<TerminalUI, 'capabilities' | 'error'> => ({
  capabilities: Effect.succeed(
    getTerminalCapabilities({
      stdin: { isTTY: tty.stdin },
      stdout: { isTTY: tty.stdout },
      stderr: { isTTY: tty.stderr },
    })
  ),
  error: line => Effect.sync(() => output.push(line)),
});

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

function makeDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  let output: string[];

  beforeEach(() => {
    output = [];
  });

  it.effect('does nothing when no state file exists', () =>
    Effect.gen(function* () {
      const { showUpdateNotice } = createUpdateChecker(makeConfig());

      yield* showUpdateNotice(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does nothing when cached version equals current version', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.2.0' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.2.0' });
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does nothing when cached version is older than current', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.3.0' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.2.0' });
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('prints upgrade hint when cached version is newer', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.2.0' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.3.0' });
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output));

      expect(output).toHaveLength(1);
      expect(output[0]).toContain('Update available');
      expect(output[0]).toContain('0.3.0');
      expect(output[0]).toContain('composio upgrade');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does not print upgrade hint when stderr is captured', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.2.0' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.3.0' });
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output, { stdin: true, stdout: true, stderr: false }));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('still prints upgrade hint when stdout is piped but stderr is a terminal', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.2.0' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.3.0' });
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output, { stdin: true, stdout: false, stderr: true }));

      expect(output).toHaveLength(1);
      expect(output[0]).toContain('Update available');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('still prints upgrade hint when stdin is redirected', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.2.0' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.3.0' });
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output, { stdin: false, stdout: true, stderr: true }));

      expect(output).toHaveLength(1);
      expect(output[0]).toContain('Update available');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('silently ignores corrupt state file', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      mkdirSync(dirname(config.stateFile), { recursive: true });
      writeFileSync(config.stateFile, 'not-json!!!');
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does nothing when cached version is not valid semver', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.2.0' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: 'not-semver' });
      const { showUpdateNotice } = createUpdateChecker(config);

      yield* showUpdateNotice(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );
});

// ── getUpdateStatus ─────────────────────────────────────────────────────

describe('getUpdateStatus', () => {
  it.effect('reports an available update for a stale stable install', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        currentVersion: '0.2.0',
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeReleasesPayload(['0.3.0'])),
        }) as unknown as typeof fetch,
      });
      const { getUpdateStatus } = createUpdateChecker(config);

      const status = yield* getUpdateStatus;

      expect(status).toEqual({
        current: '0.2.0',
        latestStable: '0.3.0',
        updateAvailable: true,
        checkStatus: 'update-available',
        lastChecked: expect.any(String),
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports an unknown status when the fetch fails and no cache exists', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        currentVersion: '0.2.0',
        fetchFn: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
      });
      const { getUpdateStatus } = createUpdateChecker(config);

      const status = yield* getUpdateStatus;

      expect(status).toEqual({
        current: '0.2.0',
        latestStable: null,
        updateAvailable: false,
        checkStatus: 'unknown',
        lastChecked: null,
      });
      expect(existsSync(config.stateFile)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does not call a stale cached version up to date after a failed refresh', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        currentVersion: '0.2.0',
        fetchFn: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
      });
      const lastChecked = '2020-01-01T00:00:00.000Z';
      writeState(config, { lastChecked, latestVersion: '0.2.0' });
      const { getUpdateStatus } = createUpdateChecker(config);

      const status = yield* getUpdateStatus;

      expect(status).toEqual({
        current: '0.2.0',
        latestStable: '0.2.0',
        updateAvailable: false,
        checkStatus: 'unknown',
        lastChecked,
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does not report a cached prerelease as latestStable', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: '0.2.32-beta.289' });
      writeState(config, {
        lastChecked: new Date().toISOString(),
        latestVersion: '0.2.32-beta.289',
      });
      const { getUpdateStatus } = createUpdateChecker(config);

      const status = yield* getUpdateStatus;

      expect(status.latestStable).toBeNull();
      expect(status.updateAvailable).toBe(false);
      expect(status.checkStatus).toBe('unknown');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('uses the fresh cache without fetching', () =>
    Effect.gen(function* () {
      const fetchFn = vi.fn();
      const config = makeConfig({
        currentVersion: '0.2.0',
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.2.1' });
      const { getUpdateStatus } = createUpdateChecker(config);

      const status = yield* getUpdateStatus;

      expect(fetchFn).not.toHaveBeenCalled();
      expect(status.latestStable).toBe('0.2.1');
      expect(status.updateAvailable).toBe(true);
      expect(status.checkStatus).toBe('update-available');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports an unknown status for an invalid installed version', () =>
    Effect.gen(function* () {
      const config = makeConfig({ currentVersion: 'corrupt-tag' });
      writeState(config, { lastChecked: new Date().toISOString(), latestVersion: '0.3.0' });
      const { getUpdateStatus } = createUpdateChecker(config);

      const status = yield* getUpdateStatus;

      expect(status).toEqual({
        current: 'corrupt-tag',
        latestStable: '0.3.0',
        updateAvailable: false,
        checkStatus: 'unknown',
        lastChecked: expect.any(String),
      });
    }).pipe(Effect.provide(PlatformLayers))
  );
});

// ── checkForUpdate ──────────────────────────────────────────────────────

describe('checkForUpdate', () => {
  // Pin the wall clock so the throttle math in checkForUpdate is deterministic.
  // Only Date is faked: the SUT awaits real fetch promises through
  // Effect.tryPromise, which need real timers/microtasks to settle.
  const pinnedNow = new Date('2026-01-01T00:00:00.000Z');
  const staleLastChecked = '2025-12-30T23:00:00.000Z'; // 25 hours before pinnedNow

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(pinnedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.effect('skips fetch when cache is fresh', () =>
    Effect.gen(function* () {
      const fetchFn = vi.fn();
      const config = makeConfig({ fetchFn: fetchFn as unknown as typeof fetch });
      writeState(config, {
        lastChecked: new Date().toISOString(),
        latestVersion: '0.2.0',
      });
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      expect(fetchFn).not.toHaveBeenCalled();
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('fetches when cache is stale', () =>
    Effect.gen(function* () {
      const stale = staleLastChecked;
      const config = makeConfig({
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeReleasesPayload(['0.3.0'])),
        }) as unknown as typeof fetch,
      });
      writeState(config, { lastChecked: stale, latestVersion: '0.2.0' });
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      expect(config.fetchFn).toHaveBeenCalledOnce();
      const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
      expect(state.latestVersion).toBe('0.3.0');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('fetches when no cache exists', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeReleasesPayload(['0.4.0', '0.3.0'])),
        }) as unknown as typeof fetch,
      });
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      expect(existsSync(config.stateFile)).toBe(true);
      const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
      expect(state.latestVersion).toBe('0.4.0');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('fetches when cache file is corrupt', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeReleasesPayload(['0.5.0'])),
        }) as unknown as typeof fetch,
      });
      mkdirSync(dirname(config.stateFile), { recursive: true });
      writeFileSync(config.stateFile, 'garbage');
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
      expect(state.latestVersion).toBe('0.5.0');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect(
    'still writes lastChecked when no CLI releases with the required binary are found',
    () =>
      Effect.gen(function* () {
        const config = makeConfig({
          fetchFn: vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  tag_name: '@composio/core@1.0.0',
                  assets: [{ name: 'composio-darwin-aarch64.zip' }],
                },
              ]),
          }) as unknown as typeof fetch,
        });
        const { checkForUpdate } = createUpdateChecker(config);

        yield* checkForUpdate;

        expect(existsSync(config.stateFile)).toBe(true);
        const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
        expect(state.lastChecked).toBeDefined();
        // Falls back to currentVersion since no previous state and no matching releases found
        expect(state.latestVersion).toBe(config.currentVersion);
      }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect(
    'preserves previous latestVersion when no CLI releases with the required binary are found',
    () =>
      Effect.gen(function* () {
        const config = makeConfig({
          fetchFn: vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  tag_name: '@composio/core@1.0.0',
                  assets: [{ name: 'composio-darwin-aarch64.zip' }],
                },
              ]),
          }) as unknown as typeof fetch,
        });
        const stale = staleLastChecked;
        writeState(config, { lastChecked: stale, latestVersion: '0.3.0' });
        const { checkForUpdate } = createUpdateChecker(config);

        yield* checkForUpdate;

        const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
        expect(state.latestVersion).toBe('0.3.0');
        expect(new Date(state.lastChecked).getTime()).toBeGreaterThan(new Date(stale).getTime());
      }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does not create authoritative state after an HTTP error', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }) as unknown as typeof fetch,
      });
      const { checkForUpdate } = createUpdateChecker(config);

      // Should not fail
      yield* checkForUpdate;

      expect(existsSync(config.stateFile)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does not create authoritative state after a network error', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: vi.fn().mockRejectedValue(new Error('DNS failed')) as unknown as typeof fetch,
      });
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      expect(existsSync(config.stateFile)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('throttles repeated network errors without creating authoritative state', () =>
    Effect.gen(function* () {
      const fetchFn = vi.fn().mockRejectedValue(new Error('DNS failed'));
      const config = makeConfig({ fetchFn: fetchFn as unknown as typeof fetch });
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;
      yield* checkForUpdate;

      expect(fetchFn).toHaveBeenCalledOnce();
      expect(existsSync(config.stateFile)).toBe(false);
      expect(existsSync(`${config.stateFile}.attempt`)).toBe(true);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('preserves stale successful state after a network error', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: vi.fn().mockRejectedValue(new Error('DNS failed')) as unknown as typeof fetch,
      });
      const previousState: UpdateCheckState = {
        lastChecked: staleLastChecked,
        latestVersion: '0.3.0',
      };
      writeState(config, previousState);
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
      expect(state).toEqual(previousState);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does not let an older failed check supersede successful state', () =>
    Effect.gen(function* () {
      const failedResponse = makeDeferred<Response>();
      const failedRequestStarted = makeDeferred<void>();
      const failingConfig = makeConfig({
        fetchFn: vi.fn(() => {
          failedRequestStarted.resolve();
          return failedResponse.promise;
        }),
      });
      const successfulConfig = makeConfig({
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeReleasesPayload(['0.3.0'])),
        }) as unknown as typeof fetch,
      });
      const failingFiber = yield* Effect.fork(createUpdateChecker(failingConfig).checkForUpdate);

      yield* Effect.promise(() => failedRequestStarted.promise);
      const successfulAt = new Date(pinnedNow.getTime() + 60_000);
      yield* Effect.sync(() => vi.setSystemTime(successfulAt));
      yield* createUpdateChecker(successfulConfig).checkForUpdate;
      yield* Effect.sync(() => vi.setSystemTime(new Date(successfulAt.getTime() + 60_000)));
      yield* Effect.sync(() => failedResponse.reject(new Error('transient failure')));
      yield* Fiber.join(failingFiber);

      const state: UpdateCheckState = JSON.parse(readFileSync(failingConfig.stateFile, 'utf-8'));
      expect(state).toEqual({
        lastChecked: successfulAt.toISOString(),
        latestVersion: '0.3.0',
      });
      expect(JSON.parse(readFileSync(`${failingConfig.stateFile}.attempt`, 'utf-8'))).toEqual({
        lastAttempted: pinnedNow.toISOString(),
      });

      const recoveryFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeReleasesPayload(['0.4.0'])),
      });
      yield* Effect.sync(() =>
        vi.setSystemTime(new Date(successfulAt.getTime() + failingConfig.checkIntervalMs + 1))
      );
      yield* createUpdateChecker(makeConfig({ fetchFn: recoveryFetch as unknown as typeof fetch }))
        .checkForUpdate;

      expect(recoveryFetch).toHaveBeenCalledOnce();
      const refreshedState: UpdateCheckState = JSON.parse(
        readFileSync(failingConfig.stateFile, 'utf-8')
      );
      expect(refreshedState.latestVersion).toBe('0.4.0');
      expect(existsSync(`${failingConfig.stateFile}.attempt`)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('sends Authorization header when accessToken is set', () =>
    Effect.gen(function* () {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeReleasesPayload(['0.2.1'])),
      });
      const config = makeConfig({
        accessToken: 'ghp_secret123',
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      expect(fetchFn).toHaveBeenCalledOnce();
      const [, init] = fetchFn.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer ghp_secret123');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does not send Authorization header when accessToken is undefined', () =>
    Effect.gen(function* () {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeReleasesPayload(['0.2.1'])),
      });
      const config = makeConfig({
        accessToken: undefined,
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      const { checkForUpdate } = createUpdateChecker(config);

      yield* checkForUpdate;

      const [, init] = fetchFn.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    }).pipe(Effect.provide(PlatformLayers))
  );
});

// ── Integration: real HTTP server ───────────────────────────────────────

describe('checkForUpdate with real HTTP', () => {
  it.effect('fetches from a real server and writes state', () =>
    withHttpServerEffect(
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(makeReleasesPayload(['0.1.26', '0.2.0', '0.2.1'])));
      },
      baseUrl =>
        Effect.gen(function* () {
          const config = makeConfig({ releasesUrl: baseUrl, fetchFn: fetch });
          const { checkForUpdate } = createUpdateChecker(config);

          yield* checkForUpdate;

          const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
          expect(state.latestVersion).toBe('0.2.1');
        })
    ).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('passes Authorization header to the server', () => {
    let receivedAuth: string | undefined;

    return withHttpServerEffect(
      (req, res) => {
        receivedAuth = req.headers.authorization;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(makeReleasesPayload(['0.2.1'])));
      },
      baseUrl =>
        Effect.gen(function* () {
          const config = makeConfig({
            releasesUrl: baseUrl,
            accessToken: 'ghp_test_token',
            fetchFn: fetch,
          });
          const { checkForUpdate } = createUpdateChecker(config);

          yield* checkForUpdate;

          expect(receivedAuth).toBe('Bearer ghp_test_token');
        })
    ).pipe(Effect.provide(PlatformLayers));
  });
});
