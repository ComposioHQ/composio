import { describe, expect, it, vi } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { FetchHttpClient, FileSystem, Path } from '@effect/platform';
import * as PlatformError from '@effect/platform/Error';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { withHttpServer } from 'test/__utils__/http-server';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import {
  formatDownloadProgress,
  formatMegabytes,
  UpgradeBinary,
  UpgradeBinaryError,
} from 'src/services/upgrade-binary';
import { NodeOs } from 'src/services/node-os';
import {
  collectExpectedRunCompanionAssetRelativePaths,
  RUN_COMPANION_RELEASE_TAG_FILENAME,
} from 'src/services/run-companion-modules';

const TerminalUINoop = Layer.succeed(
  TerminalUI,
  TerminalUI.of({
    capabilities: Effect.succeed(
      getTerminalCapabilities({
        stdin: { isTTY: false },
        stdout: { isTTY: false },
        stderr: { isTTY: false },
      })
    ),
    output: () => Effect.void,
    error: () => Effect.void,
    intro: () => Effect.void,
    outro: () => Effect.void,
    log: {
      info: () => Effect.void,
      success: () => Effect.void,
      warn: () => Effect.void,
      error: () => Effect.void,
      step: () => Effect.void,
      message: () => Effect.void,
    },
    note: () => Effect.void,
    select: (_message, options) => Effect.succeed(options[0].value),
    confirm: () => Effect.succeed(true),
    withSpinner: (_message, effect) => effect,
    useMakeSpinner: (_message, use) =>
      use({
        message: () => Effect.void,
        stop: () => Effect.void,
        error: () => Effect.void,
      }),
  })
);

const NodeOsTest = Layer.succeed(
  NodeOs,
  new NodeOs({
    homedir: '/tmp',
    tmpdir: '/tmp',
    platform: 'darwin',
    arch: 'arm64',
  })
);

const TestPlatform = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

type UpgradeOptions = {
  readonly prerelease?: boolean;
  readonly tag?: string;
};

const makeUpgradeEffect = (
  configEntries: ReadonlyArray<[string, string]>,
  options?: UpgradeOptions,
  fileSystemLayer: Layer.Layer<FileSystem.FileSystem> = BunFileSystem.layer
) =>
  Effect.gen(function* () {
    const service = yield* UpgradeBinary;
    return yield* service.upgrade(options);
  }).pipe(
    Effect.provide(UpgradeBinary.Default),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(fileSystemLayer),
    Effect.provide(TerminalUINoop),
    Effect.provide(NodeOsTest),
    Effect.withConfigProvider(ConfigProvider.fromMap(new Map(configEntries))),
    Effect.scoped
  );

const runUpgrade = (
  configEntries: ReadonlyArray<[string, string]>,
  options?: UpgradeOptions,
  fileSystemLayer?: Layer.Layer<FileSystem.FileSystem>
) => makeUpgradeEffect(configEntries, options, fileSystemLayer).pipe(Effect.flip);

const runUpgradeSuccess = (
  configEntries: ReadonlyArray<[string, string]>,
  options?: UpgradeOptions,
  fileSystemLayer?: Layer.Layer<FileSystem.FileSystem>
) => makeUpgradeEffect(configEntries, options, fileSystemLayer);

const failRenameTo = (failedTargetPath: string) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(
      FileSystem.FileSystem,
      fs =>
        new Proxy(fs, {
          get(target, property, receiver) {
            if (property !== 'rename') {
              return Reflect.get(target, property, receiver);
            }

            return (oldPath: string, newPath: string) =>
              newPath === failedTargetPath
                ? Effect.fail(
                    new PlatformError.SystemError({
                      reason: 'Busy',
                      module: 'FileSystem',
                      method: 'rename',
                      pathOrDescriptor: newPath,
                    })
                  )
                : target.rename(oldPath, newPath);
          },
        })
    )
  ).pipe(Layer.provide(BunFileSystem.layer));

/**
 * Bridge the promise-based `withHttpServer` harness into a scoped Effect:
 * acquisition starts the server and yields its base URL, and closing the
 * test scope lets `withHttpServer` run its teardown path.
 */
const scopedHttpServer = (handler: Parameters<typeof withHttpServer>[0]) =>
  Effect.acquireRelease(
    Effect.promise(
      () =>
        new Promise<{ baseUrl: string; release: () => void; closed: Promise<void> }>(
          (resolveAcquire, rejectAcquire) => {
            let release!: () => void;
            const released = new Promise<void>(resolve => {
              release = resolve;
            });
            const closed = withHttpServer(handler, baseUrl => {
              resolveAcquire({ baseUrl, release, closed });
              return released;
            });
            closed.catch(rejectAcquire);
          }
        )
    ),
    ({ release, closed }) =>
      Effect.promise(() => {
        release();
        return closed;
      })
  ).pipe(Effect.map(({ baseUrl }) => baseUrl));

const restoreStubsAndMocks = Effect.sync(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UpgradeBinary', () => {
  it.scoped('wraps non-2xx releases fetch failures with fetch context (no tag branch)', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const apiBaseUrl = yield* scopedHttpServer((_req, res) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'rate limited' }));
      });

      const error = yield* runUpgrade([
        ['GITHUB_API_BASE_URL', apiBaseUrl],
        ['GITHUB_OWNER', 'test-owner'],
        ['GITHUB_REPO', 'test-repo'],
      ]);

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(error.message).toBe('Failed to fetch releases from GitHub');
      expect(String(error.cause)).toContain('HTTP 500');
    }).pipe(Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('wraps tagged release JSON parse failures with parse context (tag branch)', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const apiBaseUrl = yield* scopedHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('not-json');
      });

      const error = yield* runUpgrade([
        ['GITHUB_API_BASE_URL', apiBaseUrl],
        ['GITHUB_OWNER', 'test-owner'],
        ['GITHUB_REPO', 'test-repo'],
        ['GITHUB_TAG', 'v9.9.9'],
      ]);

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(error.message).toBe('Failed to parse GitHub release JSON response');
    }).pipe(Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('rejects structurally invalid tagged release JSON', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const apiBaseUrl = yield* scopedHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ tag_name: 42, assets: 'not-an-array' }));
      });

      const error = yield* runUpgrade([
        ['GITHUB_API_BASE_URL', apiBaseUrl],
        ['GITHUB_OWNER', 'test-owner'],
        ['GITHUB_REPO', 'test-repo'],
        ['GITHUB_TAG', 'v9.9.9'],
      ]);

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(error.message).toBe('Failed to parse GitHub release JSON response');
    }).pipe(Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('URL-encodes slash-containing tags in tagged release request path', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });
    let receivedPath = '';

    return Effect.gen(function* () {
      const apiBaseUrl = yield* scopedHttpServer((req, res) => {
        receivedPath = req.url ?? '';
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'forced failure' }));
      });

      const tag = '@composio/cli@0.1.24';
      const error = yield* runUpgrade([
        ['GITHUB_API_BASE_URL', apiBaseUrl],
        ['GITHUB_OWNER', 'test-owner'],
        ['GITHUB_REPO', 'test-repo'],
        ['GITHUB_TAG', tag],
      ]);

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(receivedPath).toBe(
        `/repos/test-owner/test-repo/releases/tags/${encodeURIComponent(tag)}`
      );
    }).pipe(Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('skips newer releases that do not contain a binary for the current platform', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-upgrade-current-',
      });
      const fakeExecPath = path.join(installDir, 'composio');
      yield* fs.writeFileString(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.2.14\n');
      vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

      const apiBaseUrl = yield* scopedHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              tag_name: '@composio/cli@0.2.15',
              draft: false,
              prerelease: false,
              assets: [
                {
                  name: 'composio-linux-x64.zip',
                  browser_download_url: 'http://127.0.0.1/unused-linux.zip',
                },
              ],
            },
            {
              tag_name: '@composio/cli@0.2.14',
              draft: false,
              prerelease: false,
              assets: [
                {
                  name: 'composio-darwin-aarch64.zip',
                  browser_download_url: 'http://127.0.0.1/current-darwin.zip',
                },
              ],
            },
          ])
        );
      });

      const result = yield* runUpgradeSuccess([
        ['GITHUB_API_BASE_URL', apiBaseUrl],
        ['GITHUB_OWNER', 'test-owner'],
        ['GITHUB_REPO', 'test-repo'],
      ]);

      expect(result).toBeUndefined();
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('ignores prereleases when checking the stable channel', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-upgrade-current-',
      });
      const fakeExecPath = path.join(installDir, 'composio');
      yield* fs.writeFileString(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.2.17\n');
      vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

      const apiBaseUrl = yield* scopedHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              tag_name: '@composio/cli@0.2.18-beta.9',
              draft: false,
              prerelease: true,
              assets: [
                {
                  name: 'composio-darwin-aarch64.zip',
                  browser_download_url: 'http://127.0.0.1/beta.zip',
                },
              ],
            },
            {
              tag_name: '@composio/cli@0.2.17',
              draft: false,
              prerelease: false,
              assets: [
                {
                  name: 'composio-darwin-aarch64.zip',
                  browser_download_url: 'http://127.0.0.1/stable.zip',
                },
              ],
            },
          ])
        );
      });

      const result = yield* runUpgradeSuccess([
        ['GITHUB_API_BASE_URL', apiBaseUrl],
        ['GITHUB_OWNER', 'test-owner'],
        ['GITHUB_REPO', 'test-repo'],
      ]);

      expect(result).toBeUndefined();
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('selects the latest prerelease when beta upgrades are requested', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-beta-select-',
      });
      const fakeExecPath = path.join(installDir, 'composio');
      yield* fs.writeFileString(
        path.join(installDir, 'release-tag.txt'),
        '@composio/cli@0.1.0-beta.0\n'
      );
      vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

      const apiBaseUrl = yield* scopedHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              tag_name: '@composio/cli@0.2.19-beta.1',
              draft: false,
              prerelease: true,
              assets: [
                {
                  name: 'composio-darwin-aarch64.zip',
                  browser_download_url: 'http://127.0.0.1/beta-1.zip',
                },
              ],
            },
            {
              tag_name: '@composio/cli@0.2.19-beta.3',
              draft: false,
              prerelease: true,
              assets: [
                {
                  name: 'composio-darwin-aarch64.zip',
                  browser_download_url: 'http://127.0.0.1/beta-3.zip',
                },
              ],
            },
            {
              tag_name: '@composio/cli@0.2.17',
              draft: false,
              prerelease: false,
              assets: [
                {
                  name: 'composio-darwin-aarch64.zip',
                  browser_download_url: 'http://127.0.0.1/stable.zip',
                },
              ],
            },
          ])
        );
      });

      const error = yield* runUpgrade(
        [
          ['GITHUB_API_BASE_URL', apiBaseUrl],
          ['GITHUB_OWNER', 'test-owner'],
          ['GITHUB_REPO', 'test-repo'],
        ],
        { prerelease: true }
      );

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(error.message).toBe('Failed to download binary: composio-darwin-aarch64.zip');
      expect(String(error.cause)).toContain('beta-3.zip');
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('copies local-tool bundled binary assets during local-target upgrades', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-local-tool-upgrade-target-',
      });
      const sourceDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-local-tool-upgrade-source-',
      });
      const fakeExecPath = path.join(installDir, 'composio');
      const sourceBinaryPath = path.join(sourceDir, 'composio');
      const sourceLocalToolPath = path.join(
        sourceDir,
        'local-tools-binaries',
        'beeper-imessage',
        'darwin-arm64',
        'imessage-cli'
      );
      const installedLocalToolPath = path.join(
        installDir,
        'local-tools-binaries',
        'beeper-imessage',
        'darwin-arm64',
        'imessage-cli'
      );
      const staleLocalToolPath = path.join(installDir, 'local-tools-binaries', 'stale-tool');

      yield* fs.writeFileString(fakeExecPath, 'old-binary');
      yield* fs.writeFileString(sourceBinaryPath, 'new-binary');
      yield* fs.makeDirectory(path.dirname(sourceLocalToolPath), { recursive: true });
      yield* fs.writeFileString(sourceLocalToolPath, 'imessage-sidecar');
      yield* fs.makeDirectory(path.dirname(installedLocalToolPath), { recursive: true });
      yield* fs.writeFileString(installedLocalToolPath, 'old-imessage-sidecar');
      yield* fs.writeFileString(staleLocalToolPath, 'stale');
      const originalBinaryInfo = yield* fs.stat(fakeExecPath);

      vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

      const companionRelativePaths =
        yield* collectExpectedRunCompanionAssetRelativePaths(sourceDir);
      for (const relativePath of companionRelativePaths) {
        const companionPath = path.join(sourceDir, relativePath);
        yield* fs.makeDirectory(path.dirname(companionPath), { recursive: true });
        yield* fs.writeFileString(companionPath, 'support-file');
      }

      const result = yield* runUpgradeSuccess([
        ['DEBUG_OVERRIDE_UPGRADE_TARGET', sourceBinaryPath],
      ]);

      expect(result).toBeUndefined();
      expect(yield* fs.readFileString(fakeExecPath)).toBe('new-binary');
      const replacedBinaryInfo = yield* fs.stat(fakeExecPath);
      expect(replacedBinaryInfo.dev).toBe(originalBinaryInfo.dev);
      expect(Option.getOrThrow(replacedBinaryInfo.ino)).not.toBe(
        Option.getOrThrow(originalBinaryInfo.ino)
      );
      expect(replacedBinaryInfo.mode & 0o777).toBe(0o755);
      expect(yield* fs.exists(installedLocalToolPath)).toBe(true);
      expect(yield* fs.readFileString(installedLocalToolPath)).toBe('imessage-sidecar');
      expect(yield* fs.exists(staleLocalToolPath)).toBe(false);
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('commits companions and release metadata before replacing the binary', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-ordered-upgrade-target-',
      });
      const sourceDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-ordered-upgrade-source-',
      });
      const fakeExecPath = path.join(installDir, 'composio');
      const sourceBinaryPath = path.join(sourceDir, 'composio');
      const releaseTagPath = path.join(installDir, RUN_COMPANION_RELEASE_TAG_FILENAME);
      const newReleaseTag = '@composio/cli@0.3.0';
      yield* fs.writeFileString(fakeExecPath, 'old-binary');
      yield* fs.writeFileString(sourceBinaryPath, 'new-binary');
      yield* fs.writeFileString(releaseTagPath, '@composio/cli@0.2.31\n');
      const originalReleaseTagInfo = yield* fs.stat(releaseTagPath);

      const companionRelativePaths =
        yield* collectExpectedRunCompanionAssetRelativePaths(sourceDir);
      for (const relativePath of companionRelativePaths) {
        const companionPath = path.join(sourceDir, relativePath);
        yield* fs.makeDirectory(path.dirname(companionPath), { recursive: true });
        yield* fs.writeFileString(companionPath, 'new-support-file');
      }
      const observedCompanionPath = path.join(installDir, companionRelativePaths[0]!);
      yield* fs.makeDirectory(path.dirname(observedCompanionPath), { recursive: true });
      yield* fs.writeFileString(observedCompanionPath, 'old-support-file');
      vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

      const error = yield* runUpgrade(
        [['DEBUG_OVERRIDE_UPGRADE_TARGET', sourceBinaryPath]],
        { tag: newReleaseTag },
        failRenameTo(fakeExecPath)
      );

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(error.message).toBe(
        `Failed to replace binary: Failed to replace file at ${fakeExecPath}`
      );
      expect(error.cause).toBeInstanceOf(PlatformError.SystemError);
      expect(yield* fs.readFileString(fakeExecPath)).toBe('old-binary');
      expect(yield* fs.readFileString(observedCompanionPath)).toBe('new-support-file');
      expect(yield* fs.readFileString(releaseTagPath)).toBe(`${newReleaseTag}\n`);
      const replacedReleaseTagInfo = yield* fs.stat(releaseTagPath);
      expect(Option.getOrThrow(replacedReleaseTagInfo.ino)).not.toBe(
        Option.getOrThrow(originalReleaseTagInfo.ino)
      );
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('preflights every companion before changing installed files', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-incomplete-upgrade-target-',
      });
      const sourceDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-incomplete-upgrade-source-',
      });
      const fakeExecPath = path.join(installDir, 'composio');
      const sourceBinaryPath = path.join(sourceDir, 'composio');
      const releaseTagPath = path.join(installDir, RUN_COMPANION_RELEASE_TAG_FILENAME);
      yield* fs.writeFileString(fakeExecPath, 'old-binary');
      yield* fs.writeFileString(sourceBinaryPath, 'new-binary');
      yield* fs.writeFileString(releaseTagPath, '@composio/cli@0.2.31\n');

      const companionRelativePaths =
        yield* collectExpectedRunCompanionAssetRelativePaths(sourceDir);
      const missingRelativePath = companionRelativePaths.at(-1)!;
      for (const relativePath of companionRelativePaths) {
        if (relativePath === missingRelativePath) continue;
        const companionPath = path.join(sourceDir, relativePath);
        yield* fs.makeDirectory(path.dirname(companionPath), { recursive: true });
        yield* fs.writeFileString(companionPath, 'new-support-file');
      }
      const observedCompanionPath = path.join(installDir, companionRelativePaths[0]!);
      yield* fs.makeDirectory(path.dirname(observedCompanionPath), { recursive: true });
      yield* fs.writeFileString(observedCompanionPath, 'old-support-file');

      const sourceLocalToolPath = path.join(sourceDir, 'local-tools-binaries', 'test-tool');
      const installedLocalToolPath = path.join(installDir, 'local-tools-binaries', 'test-tool');
      yield* fs.makeDirectory(path.dirname(sourceLocalToolPath), { recursive: true });
      yield* fs.writeFileString(sourceLocalToolPath, 'new-local-tool');
      yield* fs.makeDirectory(path.dirname(installedLocalToolPath), { recursive: true });
      yield* fs.writeFileString(installedLocalToolPath, 'old-local-tool');
      vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

      const error = yield* runUpgrade([['DEBUG_OVERRIDE_UPGRADE_TARGET', sourceBinaryPath]], {
        tag: '@composio/cli@0.3.0',
      });

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(error.message).toBe('Downloaded binary package is incomplete');
      expect(String(error.cause)).toContain(missingRelativePath);
      expect(yield* fs.readFileString(fakeExecPath)).toBe('old-binary');
      expect(yield* fs.readFileString(observedCompanionPath)).toBe('old-support-file');
      expect(yield* fs.readFileString(installedLocalToolPath)).toBe('old-local-tool');
      expect(yield* fs.readFileString(releaseTagPath)).toBe('@composio/cli@0.2.31\n');
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('replaces the bundle target without replacing its entry-point symlink', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-symlink-upgrade-target-',
      });
      const binDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-symlink-upgrade-entry-',
      });
      const sourceDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-symlink-upgrade-source-',
      });
      const installedBinaryPath = path.join(installDir, 'composio');
      const entryPointPath = path.join(binDir, 'composio');
      const sourceBinaryPath = path.join(sourceDir, 'composio');

      yield* fs.writeFileString(installedBinaryPath, 'old-binary');
      yield* fs.writeFileString(sourceBinaryPath, 'new-binary');
      yield* fs.symlink(installedBinaryPath, entryPointPath);
      const originalLinkTarget = yield* fs.readLink(entryPointPath);
      vi.spyOn(process, 'execPath', 'get').mockReturnValue(installedBinaryPath);

      const companionRelativePaths =
        yield* collectExpectedRunCompanionAssetRelativePaths(sourceDir);
      for (const relativePath of companionRelativePaths) {
        const companionPath = path.join(sourceDir, relativePath);
        yield* fs.makeDirectory(path.dirname(companionPath), { recursive: true });
        yield* fs.writeFileString(companionPath, 'support-file');
      }

      const result = yield* runUpgradeSuccess([
        ['DEBUG_OVERRIDE_UPGRADE_TARGET', sourceBinaryPath],
      ]);

      expect(result).toBeUndefined();
      expect(yield* fs.readFileString(installedBinaryPath)).toBe('new-binary');
      expect(yield* fs.readLink(entryPointPath)).toBe(originalLinkTarget);
      expect(yield* fs.exists(entryPointPath)).toBe(true);
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('uses the installed beta release tag when comparing beta updates', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installDir = yield* fs.makeTempDirectoryScoped({
        prefix: 'composio-beta-upgrade-',
      });
      const fakeExecPath = path.join(installDir, 'composio');
      yield* fs.writeFileString(
        path.join(installDir, 'release-tag.txt'),
        '@composio/cli@0.2.17-beta.1\n'
      );
      vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

      const apiBaseUrl = yield* scopedHttpServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              tag_name: '@composio/cli@0.2.17-beta.3',
              draft: false,
              prerelease: true,
              assets: [
                {
                  name: 'composio-darwin-aarch64.zip',
                  browser_download_url: 'http://127.0.0.1/beta-3.zip',
                },
              ],
            },
          ])
        );
      });

      const error = yield* runUpgrade(
        [
          ['GITHUB_API_BASE_URL', apiBaseUrl],
          ['GITHUB_OWNER', 'test-owner'],
          ['GITHUB_REPO', 'test-repo'],
        ],
        { prerelease: true }
      );

      expect(error).toBeInstanceOf(UpgradeBinaryError);
      if (!(error instanceof UpgradeBinaryError)) {
        throw error;
      }
      expect(error.message).toBe('Failed to download binary: composio-darwin-aarch64.zip');
      expect(String(error.cause)).toContain('beta-3.zip');
    }).pipe(Effect.provide(TestPlatform), Effect.ensuring(restoreStubsAndMocks));
  });
});

describe('formatDownloadProgress', () => {
  it('reports percent and both sizes when the total is known', () => {
    expect(formatDownloadProgress({ receivedBytes: 142_000_000, totalBytes: 338_000_000 })).toBe(
      'Downloading... 42% (142.0 MB / 338.0 MB)'
    );
  });

  it('reports bytes alone when the server never sent a size', () => {
    expect(formatDownloadProgress({ receivedBytes: 12_500_000, totalBytes: undefined })).toBe(
      'Downloading... 12.5 MB'
    );
  });

  it('treats a zero total as unknown rather than dividing by it', () => {
    expect(formatDownloadProgress({ receivedBytes: 1_000_000, totalBytes: 0 })).toBe(
      'Downloading... 1.0 MB'
    );
  });

  it('never exceeds 100% when more bytes arrive than announced', () => {
    expect(formatDownloadProgress({ receivedBytes: 400_000_000, totalBytes: 338_000_000 })).toBe(
      'Downloading... 100% (400.0 MB / 338.0 MB)'
    );
  });

  it('formats megabytes to one decimal place', () => {
    expect(formatMegabytes(0)).toBe('0.0 MB');
    expect(formatMegabytes(338_027_339)).toBe('338.0 MB');
  });
});
