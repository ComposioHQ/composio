import { describe, expect, it, vi } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { FetchHttpClient, FileSystem, HttpClient, Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withHttpServer } from 'test/__utils__/http-server';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import {
  atomicReplaceDirectory,
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
    }).pipe(Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('ignores prereleases when checking the stable channel', () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    return Effect.gen(function* () {
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
    }).pipe(Effect.ensuring(restoreStubsAndMocks));
  });

  it.scoped('selects the latest prerelease when beta upgrades are requested', () => {
    const installDir = mkdtempSync(path.join(tmpdir(), 'composio-beta-select-'));
    const fakeExecPath = path.join(installDir, 'composio');
    writeFileSync(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.1.0-beta.0\n');
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });
    const execPathSpy = vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

    return Effect.gen(function* () {
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
    }).pipe(
      Effect.ensuring(Effect.sync(() => execPathSpy.mockRestore())),
      Effect.ensuring(restoreStubsAndMocks)
    );
  });

  it.effect('copies local-tool bundled binary assets during local-target upgrades', () => {
    const installDir = mkdtempSync(path.join(tmpdir(), 'composio-local-tool-upgrade-target-'));
    const sourceDir = mkdtempSync(path.join(tmpdir(), 'composio-local-tool-upgrade-source-'));
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

    writeFileSync(fakeExecPath, 'old-binary');
    writeFileSync(sourceBinaryPath, 'new-binary');
    mkdirSync(path.dirname(sourceLocalToolPath), { recursive: true });
    writeFileSync(sourceLocalToolPath, 'imessage-sidecar');

    vi.stubGlobal('Bun', { which: vi.fn(() => null) });
    const execPathSpy = vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

    return Effect.gen(function* () {
      const companionRelativePaths = yield* collectExpectedRunCompanionAssetRelativePaths(
        sourceDir
      ).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, Path.layer)));
      for (const relativePath of companionRelativePaths) {
        const companionPath = path.join(sourceDir, relativePath);
        mkdirSync(path.dirname(companionPath), { recursive: true });
        writeFileSync(companionPath, 'support-file');
      }

      const result = yield* runUpgradeSuccess([
        ['DEBUG_OVERRIDE_UPGRADE_TARGET', sourceBinaryPath],
      ]);

      expect(result).toBeUndefined();
      expect(readFileSync(fakeExecPath, 'utf8')).toBe('new-binary');
      expect(existsSync(installedLocalToolPath)).toBe(true);
      expect(readFileSync(installedLocalToolPath, 'utf8')).toBe('imessage-sidecar');
    }).pipe(
      Effect.ensuring(Effect.sync(() => execPathSpy.mockRestore())),
      Effect.ensuring(restoreStubsAndMocks)
    );
  });

  it.scoped('uses the installed beta release tag when comparing beta updates', () => {
    const installDir = mkdtempSync(path.join(tmpdir(), 'composio-beta-upgrade-'));
    const fakeExecPath = path.join(installDir, 'composio');
    writeFileSync(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.2.17-beta.1\n');
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });
    const execPathSpy = vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

    return Effect.gen(function* () {
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
    }).pipe(
      Effect.ensuring(Effect.sync(() => execPathSpy.mockRestore())),
      Effect.ensuring(restoreStubsAndMocks)
    );
  });
});

const ReplaceLayers = Layer.mergeAll(BunFileSystem.layer, Path.layer, FetchHttpClient.layer);

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

    return { sourceDir, targetDir, companionRelativePaths };
  });

  const cleanupInstall = (dirs: { sourceDir: string; targetDir: string }) =>
    Effect.sync(() => {
      rmSync(dirs.sourceDir, { recursive: true, force: true });
      rmSync(dirs.targetDir, { recursive: true, force: true });
    });

  const listTempLeftovers = (dir: string): string[] =>
    readdirSync(dir).filter(entry => entry.includes('.tmp-'));

  it.effect('restores the installed directory when the staged rename fails', () =>
    Effect.gen(function* () {
      const sourceDir = mkdtempSync(path.join(tmpdir(), 'composio-directory-source-'));
      const targetParent = mkdtempSync(path.join(tmpdir(), 'composio-directory-target-'));
      const targetDir = path.join(targetParent, 'local-tools-binaries');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(path.join(sourceDir, 'asset'), 'new');
      writeFileSync(path.join(targetDir, 'asset'), 'old');

      yield* Effect.gen(function* () {
        const ctx = yield* makeReplaceCtx;
        let rejectedSwap = false;
        const fs = new Proxy(ctx.fs, {
          get(target, property, receiver) {
            if (property !== 'rename') {
              return Reflect.get(target, property, receiver);
            }
            return (oldPath: string, newPath: string) => {
              if (!rejectedSwap && newPath === targetDir && oldPath.includes('.tmp-')) {
                rejectedSwap = true;
                return target.rename(path.join(sourceDir, 'missing'), newPath);
              }
              return target.rename(oldPath, newPath);
            };
          },
        });

        const error = yield* atomicReplaceDirectory(
          { ...ctx, fs },
          sourceDir,
          targetDir,
          'Failed to replace local-tool binary assets'
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(UpgradeBinaryError);
        expect(readFileSync(path.join(targetDir, 'asset'), 'utf8')).toBe('old');
        expect(listTempLeftovers(targetParent)).toEqual([]);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(targetParent, { recursive: true, force: true });
          })
        )
      );
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('preserves the backup when both the staged rename and rollback fail', () =>
    Effect.gen(function* () {
      const sourceDir = mkdtempSync(path.join(tmpdir(), 'composio-directory-source-'));
      const targetParent = mkdtempSync(path.join(tmpdir(), 'composio-directory-target-'));
      const targetDir = path.join(targetParent, 'local-tools-binaries');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(path.join(sourceDir, 'asset'), 'new');
      writeFileSync(path.join(targetDir, 'asset'), 'old');

      yield* Effect.gen(function* () {
        const ctx = yield* makeReplaceCtx;
        let renameIntoTargetAttempts = 0;
        const fs = new Proxy(ctx.fs, {
          get(target, property, receiver) {
            if (property !== 'rename') {
              return Reflect.get(target, property, receiver);
            }
            return (oldPath: string, newPath: string) => {
              if (newPath === targetDir && oldPath.includes('.tmp-')) {
                renameIntoTargetAttempts += 1;
                if (renameIntoTargetAttempts <= 2) {
                  return target.rename(path.join(sourceDir, 'missing'), newPath);
                }
              }
              return target.rename(oldPath, newPath);
            };
          },
        });

        const error = yield* atomicReplaceDirectory(
          { ...ctx, fs },
          sourceDir,
          targetDir,
          'Failed to replace local-tool binary assets'
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(UpgradeBinaryError);
        expect(existsSync(targetDir)).toBe(false);
        const leftovers = listTempLeftovers(targetParent);
        expect(leftovers).toHaveLength(1);
        expect(readFileSync(path.join(targetParent, leftovers[0], 'asset'), 'utf8')).toBe('old');
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(targetParent, { recursive: true, force: true });
          })
        )
      );
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('swaps binary, companions, and release tag with no temp leftovers', () =>
    Effect.gen(function* () {
      const install = yield* setupInstall;
      const { sourceDir, targetDir, companionRelativePaths } = install;

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
        expect(listTempLeftovers(targetDir)).toEqual([]);
      }).pipe(Effect.ensuring(cleanupInstall(install)));
    }).pipe(Effect.provide(ReplaceLayers))
  );

  it.effect('aborts before touching the install when a source companion is missing', () =>
    Effect.gen(function* () {
      const install = yield* setupInstall;
      const { sourceDir, targetDir, companionRelativePaths } = install;
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
});
