import { describe, expect, it, vi } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { FetchHttpClient, FileSystem, HttpClient, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withHttpServer } from 'test/__utils__/http-server';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import {
  INSTALL_TRANSACTION_JOURNAL_FILENAME,
  INSTALL_TRANSACTION_LOCK_FILENAME,
  INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME,
  recoverInterruptedBinaryReplacement,
  replaceBinary,
  UpgradeBinary,
  UpgradeBinaryError,
  type UpgradeBinaryContext,
} from 'src/services/upgrade-binary';
import { NodeOs } from 'src/services/node-os';
import { collectExpectedRunCompanionAssetRelativePaths } from 'src/services/run-companion-modules';

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

const makeUpgradeEffect = (
  configEntries: ReadonlyArray<[string, string]>,
  options?: {
    prerelease?: boolean;
  }
) =>
  Effect.gen(function* () {
    const service = yield* UpgradeBinary;
    return yield* service.upgrade(options);
  }).pipe(
    Effect.provide(UpgradeBinary.Default),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(BunFileSystem.layer),
    Effect.provide(TerminalUINoop),
    Effect.provide(NodeOsTest),
    Effect.withConfigProvider(ConfigProvider.fromMap(new Map(configEntries))),
    Effect.scoped
  );

const runUpgrade = (
  configEntries: ReadonlyArray<[string, string]>,
  options?: {
    prerelease?: boolean;
  }
) => makeUpgradeEffect(configEntries, options).pipe(Effect.flip);

const runUpgradeSuccess = (
  configEntries: ReadonlyArray<[string, string]>,
  options?: {
    prerelease?: boolean;
  }
) => makeUpgradeEffect(configEntries, options);

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

      yield* fs.writeFileString(fakeExecPath, 'old-binary');
      yield* fs.writeFileString(sourceBinaryPath, 'new-binary');
      yield* fs.makeDirectory(path.dirname(sourceLocalToolPath), { recursive: true });
      yield* fs.writeFileString(sourceLocalToolPath, 'imessage-sidecar');

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
      expect(yield* fs.exists(installedLocalToolPath)).toBe(true);
      expect(yield* fs.readFileString(installedLocalToolPath)).toBe('imessage-sidecar');
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

const ReplaceLayers = Layer.mergeAll(BunFileSystem.layer, Path.layer, FetchHttpClient.layer);

const listTransactionLeftovers = (dir: string): string[] =>
  readdirSync(dir).filter(
    entry =>
      entry.includes('.staged-') ||
      entry.includes('.backup-') ||
      entry === INSTALL_TRANSACTION_JOURNAL_FILENAME ||
      entry === INSTALL_TRANSACTION_LOCK_FILENAME ||
      entry.startsWith(INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME)
  );

const makeReplaceCtx = Effect.gen(function* () {
  return {
    httpClient: yield* HttpClient.HttpClient,
    fs: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    githubConfig: {
      API_BASE_URL: 'http://127.0.0.1:9',
      OWNER: 'test-owner',
      REPO: 'test-repo',
      TAG: Option.none<string>(),
      ACCESS_TOKEN: Option.none<string>(),
    },
  } satisfies UpgradeBinaryContext;
});

describe('replaceBinary', () => {
  const setupInstall = Effect.gen(function* () {
    const sourceDir = mkdtempSync(path.join(tmpdir(), 'composio-replace-source-'));
    const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-replace-target-'));

    const companionRelativePaths = yield* collectExpectedRunCompanionAssetRelativePaths(
      sourceDir
    ).pipe(Effect.provide(ReplaceLayers));
    for (const relativePath of companionRelativePaths) {
      const sourceCompanion = path.join(sourceDir, relativePath);
      mkdirSync(path.dirname(sourceCompanion), { recursive: true });
      writeFileSync(sourceCompanion, `new-${relativePath}`);
      const targetCompanion = path.join(targetDir, relativePath);
      mkdirSync(path.dirname(targetCompanion), { recursive: true });
      writeFileSync(targetCompanion, `old-${relativePath}`);
    }

    writeFileSync(path.join(sourceDir, 'composio'), 'new-binary');
    writeFileSync(path.join(targetDir, 'composio'), 'old-binary', { mode: 0o755 });
    writeFileSync(path.join(targetDir, 'release-tag.txt'), '@composio/cli@0.1.0\n');
    const localToolsRelativePath = path.join(
      'local-tools-binaries',
      'test-tool',
      'test-platform',
      'tool'
    );
    mkdirSync(path.dirname(path.join(sourceDir, localToolsRelativePath)), { recursive: true });
    mkdirSync(path.dirname(path.join(targetDir, localToolsRelativePath)), { recursive: true });
    writeFileSync(path.join(sourceDir, localToolsRelativePath), 'new-local-tool');
    writeFileSync(path.join(targetDir, localToolsRelativePath), 'old-local-tool');

    return { sourceDir, targetDir, companionRelativePaths, localToolsRelativePath };
  });

  const cleanupInstall = (dirs: { sourceDir: string; targetDir: string }) =>
    Effect.sync(() => {
      rmSync(dirs.sourceDir, { recursive: true, force: true });
      rmSync(dirs.targetDir, { recursive: true, force: true });
    });

  const listTempLeftovers = (dir: string): string[] =>
    readdirSync(dir).filter(entry => entry.includes('.tmp-'));

  it.effect('swaps binary, companions, and release tag with no temp leftovers', () =>
    Effect.gen(function* () {
      const install = yield* setupInstall;
      const { sourceDir, targetDir, companionRelativePaths, localToolsRelativePath } = install;

      yield* Effect.gen(function* () {
        const ctx = yield* makeReplaceCtx;
        yield* replaceBinary(
          ctx,
          path.join(sourceDir, 'composio'),
          path.join(targetDir, 'composio'),
          { releaseTag: '@composio/cli@0.2.0' }
        );

        expect(readFileSync(path.join(targetDir, 'composio'), 'utf8')).toBe('new-binary');
        expect(statSync(path.join(targetDir, 'composio')).mode & 0o111).not.toBe(0);
        expect(readFileSync(path.join(targetDir, 'release-tag.txt'), 'utf8')).toBe(
          '@composio/cli@0.2.0\n'
        );
        for (const relativePath of companionRelativePaths) {
          expect(readFileSync(path.join(targetDir, relativePath), 'utf8')).toBe(
            `new-${relativePath}`
          );
        }
        expect(readFileSync(path.join(targetDir, localToolsRelativePath), 'utf8')).toBe(
          'new-local-tool'
        );
        expect(listTempLeftovers(targetDir)).toEqual([]);
        expect(listTransactionLeftovers(targetDir)).toEqual([]);
      }).pipe(Effect.ensuring(cleanupInstall(install)));
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('aborts before touching the install when a source companion is missing', () =>
    Effect.gen(function* () {
      const install = yield* setupInstall;
      const { sourceDir, targetDir, companionRelativePaths, localToolsRelativePath } = install;
      const removedCompanion = companionRelativePaths[0];
      rmSync(path.join(sourceDir, removedCompanion), { force: true });

      yield* Effect.gen(function* () {
        const ctx = yield* makeReplaceCtx;
        const error = yield* replaceBinary(
          ctx,
          path.join(sourceDir, 'composio'),
          path.join(targetDir, 'composio'),
          { releaseTag: '@composio/cli@0.2.0' }
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(UpgradeBinaryError);
        expect(error.message).toBe('Downloaded binary package is incomplete');
        expect(readFileSync(path.join(targetDir, 'composio'), 'utf8')).toBe('old-binary');
        expect(readFileSync(path.join(targetDir, 'release-tag.txt'), 'utf8')).toBe(
          '@composio/cli@0.1.0\n'
        );
        for (const relativePath of companionRelativePaths) {
          expect(readFileSync(path.join(targetDir, relativePath), 'utf8')).toBe(
            `old-${relativePath}`
          );
        }
        expect(readFileSync(path.join(targetDir, localToolsRelativePath), 'utf8')).toBe(
          'old-local-tool'
        );
      }).pipe(Effect.ensuring(cleanupInstall(install)));
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect(
    'keeps the old binary intact and executable when the swap fails at the binary step',
    () =>
      Effect.gen(function* () {
        const install = yield* setupInstall;
        const { sourceDir, targetDir } = install;
        rmSync(path.join(sourceDir, 'composio'), { force: true });

        yield* Effect.gen(function* () {
          const ctx = yield* makeReplaceCtx;
          const error = yield* replaceBinary(
            ctx,
            path.join(sourceDir, 'composio'),
            path.join(targetDir, 'composio'),
            { releaseTag: '@composio/cli@0.2.0' }
          ).pipe(Effect.flip);

          expect(error).toBeInstanceOf(UpgradeBinaryError);
          expect(error.message).toBe('Failed to replace binary');
          expect(readFileSync(path.join(targetDir, 'composio'), 'utf8')).toBe('old-binary');
          expect(statSync(path.join(targetDir, 'composio')).mode & 0o111).not.toBe(0);
          expect(readFileSync(path.join(targetDir, 'release-tag.txt'), 'utf8')).toBe(
            '@composio/cli@0.1.0\n'
          );
          expect(listTempLeftovers(targetDir)).toEqual([]);
        }).pipe(Effect.ensuring(cleanupInstall(install)));
      }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('rolls back every installed artifact when the release-tag commit fails', () =>
    Effect.gen(function* () {
      const install = yield* setupInstall;
      const { sourceDir, targetDir, companionRelativePaths, localToolsRelativePath } = install;

      yield* Effect.gen(function* () {
        const ctx = yield* makeReplaceCtx;
        const releaseTagPath = path.join(targetDir, 'release-tag.txt');
        let rejectedReleaseTag = false;
        const fs = new Proxy(ctx.fs, {
          get(target, property, receiver) {
            if (property !== 'rename') {
              return Reflect.get(target, property, receiver);
            }
            return (oldPath: string, newPath: string) => {
              if (
                !rejectedReleaseTag &&
                newPath === releaseTagPath &&
                oldPath.includes('.staged-')
              ) {
                rejectedReleaseTag = true;
                return target.rename(path.join(sourceDir, 'missing'), newPath);
              }
              return target.rename(oldPath, newPath);
            };
          },
        });

        const error = yield* replaceBinary(
          { ...ctx, fs },
          path.join(sourceDir, 'composio'),
          path.join(targetDir, 'composio'),
          { releaseTag: '@composio/cli@0.2.0' }
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(UpgradeBinaryError);
        expect(readFileSync(path.join(targetDir, 'composio'), 'utf8')).toBe('old-binary');
        expect(readFileSync(path.join(targetDir, 'release-tag.txt'), 'utf8')).toBe(
          '@composio/cli@0.1.0\n'
        );
        for (const relativePath of companionRelativePaths) {
          expect(readFileSync(path.join(targetDir, relativePath), 'utf8')).toBe(
            `old-${relativePath}`
          );
        }
        expect(readFileSync(path.join(targetDir, localToolsRelativePath), 'utf8')).toBe(
          'old-local-tool'
        );
        expect(listTransactionLeftovers(targetDir)).toEqual([]);
      }).pipe(Effect.ensuring(cleanupInstall(install)));
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('does not fail a committed release when backup cleanup fails', () =>
    Effect.gen(function* () {
      const install = yield* setupInstall;
      const { sourceDir, targetDir } = install;

      yield* Effect.gen(function* () {
        const ctx = yield* makeReplaceCtx;
        const fs = new Proxy(ctx.fs, {
          get(target, property, receiver) {
            if (property !== 'remove') {
              return Reflect.get(target, property, receiver);
            }
            return (targetPath: string, options?: { recursive?: boolean; force?: boolean }) =>
              targetPath.includes('.backup-')
                ? target.remove(path.join(sourceDir, 'missing-cleanup-target'))
                : target.remove(targetPath, options);
          },
        });

        yield* replaceBinary(
          { ...ctx, fs },
          path.join(sourceDir, 'composio'),
          path.join(targetDir, 'composio'),
          { releaseTag: '@composio/cli@0.2.0' }
        );

        expect(readFileSync(path.join(targetDir, 'composio'), 'utf8')).toBe('new-binary');
        expect(readFileSync(path.join(targetDir, 'release-tag.txt'), 'utf8')).toBe(
          '@composio/cli@0.2.0\n'
        );
      }).pipe(Effect.ensuring(cleanupInstall(install)));
    }).pipe(Effect.provide(ReplaceLayers))
  );
});

describe('recoverInterruptedBinaryReplacement', () => {
  const transactionId = '1234567890abcdef';

  const setupInterruptedTransaction = (
    targetDir: string,
    state: 'target-missing' | 'target-new'
  ) => {
    const targetPath = path.join(targetDir, 'composio');
    const stagedPath = path.join(targetDir, `.composio.staged-${transactionId}`);
    const backupPath = path.join(targetDir, `.composio.backup-${transactionId}`);
    writeFileSync(backupPath, 'old-binary', { mode: 0o755 });
    if (state === 'target-missing') {
      writeFileSync(stagedPath, 'new-binary', { mode: 0o755 });
    } else {
      writeFileSync(targetPath, 'new-binary', { mode: 0o755 });
    }
    writeFileSync(
      path.join(targetDir, INSTALL_TRANSACTION_JOURNAL_FILENAME),
      JSON.stringify({
        transactionId,
        entries: [{ relativePath: 'composio', kind: 'file', hadTarget: true }],
      })
    );
    return { targetPath, stagedPath, backupPath };
  };

  it.effect('keeps the healthy no-state startup path read-only', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const targetPath = path.join(targetDir, 'composio');
      writeFileSync(targetPath, 'old-binary', { mode: 0o755 });
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('none');
        expect(listTransactionLeftovers(targetDir)).toEqual([]);
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('restores an old target when a crash happens before staged rename', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const { targetPath } = setupInterruptedTransaction(targetDir, 'target-missing');
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('recovered');
        expect(readFileSync(targetPath, 'utf8')).toBe('old-binary');
        expect(listTransactionLeftovers(targetDir)).toEqual([]);
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('replaces a new target with its old backup after a crash', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const { targetPath } = setupInterruptedTransaction(targetDir, 'target-new');
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('recovered');
        expect(readFileSync(targetPath, 'utf8')).toBe('old-binary');
        expect(listTransactionLeftovers(targetDir)).toEqual([]);
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('does not recover while a live install transaction owns the lock', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const { targetPath } = setupInterruptedTransaction(targetDir, 'target-new');
      writeFileSync(path.join(targetDir, INSTALL_TRANSACTION_LOCK_FILENAME), '');
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('busy');
        expect(readFileSync(targetPath, 'utf8')).toBe('new-binary');
        expect(existsSync(path.join(targetDir, INSTALL_TRANSACTION_JOURNAL_FILENAME))).toBe(true);
        expect(existsSync(path.join(targetDir, INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME))).toBe(
          false
        );
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('retires an orphaned stale install lock that has no journal', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const targetPath = path.join(targetDir, 'composio');
      writeFileSync(targetPath, 'old-binary', { mode: 0o755 });
      const lockPath = path.join(targetDir, INSTALL_TRANSACTION_LOCK_FILENAME);
      writeFileSync(lockPath, '');
      const staleAt = new Date(0);
      utimesSync(lockPath, staleAt, staleAt);
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('none');
        expect(existsSync(lockPath)).toBe(false);
        expect(readFileSync(targetPath, 'utf8')).toBe('old-binary');
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('does not disturb a live recovery owner', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const { targetPath } = setupInterruptedTransaction(targetDir, 'target-new');
      const recoveryLockPath = path.join(targetDir, INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME);
      writeFileSync(recoveryLockPath, 'live-owner');
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('busy');
        expect(readFileSync(recoveryLockPath, 'utf8')).toBe('live-owner');
        expect(readFileSync(targetPath, 'utf8')).toBe('new-binary');
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('reclaims a stale recovery owner and completes rollback', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const { targetPath } = setupInterruptedTransaction(targetDir, 'target-new');
      const recoveryLockPath = path.join(targetDir, INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME);
      writeFileSync(recoveryLockPath, 'crashed-owner');
      const staleAt = new Date(0);
      utimesSync(recoveryLockPath, staleAt, staleAt);
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('recovered');
        expect(readFileSync(targetPath, 'utf8')).toBe('old-binary');
        expect(listTransactionLeftovers(targetDir)).toEqual([]);
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('retires an orphaned stale recovery owner with no transaction state', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const targetPath = path.join(targetDir, 'composio');
      writeFileSync(targetPath, 'old-binary', { mode: 0o755 });
      const recoveryLockPath = path.join(targetDir, INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME);
      writeFileSync(recoveryLockPath, 'crashed-owner');
      const staleAt = new Date(0);
      utimesSync(recoveryLockPath, staleAt, staleAt);
      try {
        expect(yield* recoverInterruptedBinaryReplacement(targetPath)).toBe('none');
        expect(existsSync(recoveryLockPath)).toBe(false);
        expect(readFileSync(targetPath, 'utf8')).toBe('old-binary');
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('allows only one concurrent startup to own recovery', () =>
    Effect.gen(function* () {
      const targetDir = mkdtempSync(path.join(tmpdir(), 'composio-recovery-'));
      const { targetPath } = setupInterruptedTransaction(targetDir, 'target-new');
      const realFs = yield* FileSystem.FileSystem;
      const delayedFs = new Proxy(realFs, {
        get(target, property, receiver) {
          if (property !== 'remove') {
            return Reflect.get(target, property, receiver);
          }
          return (removedPath: string, options?: { recursive?: boolean; force?: boolean }) =>
            removedPath === targetPath
              ? Effect.yieldNow().pipe(Effect.andThen(target.remove(removedPath, options)))
              : target.remove(removedPath, options);
        },
      });
      try {
        const recover = recoverInterruptedBinaryReplacement(targetPath).pipe(
          Effect.provideService(FileSystem.FileSystem, delayedFs)
        );
        const results = yield* Effect.all([recover, recover], { concurrency: 'unbounded' });
        expect(results.filter(result => result === 'recovered')).toHaveLength(1);
        expect(results.filter(result => result === 'busy')).toHaveLength(1);
        expect(readFileSync(targetPath, 'utf8')).toBe('old-binary');
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(ReplaceLayers))
  );
});
