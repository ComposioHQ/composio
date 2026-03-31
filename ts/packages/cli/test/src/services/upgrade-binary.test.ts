import { describe, expect, it, vi } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withHttpServer } from 'test/__utils__/http-server';
import { TerminalUI } from 'src/services/terminal-ui';
import { UpgradeBinary, UpgradeBinaryError } from 'src/services/upgrade-binary';
import { NodeOs } from 'src/services/node-os';

const TerminalUINoop = Layer.succeed(
  TerminalUI,
  TerminalUI.of({
    output: () => Effect.void,
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
) => makeUpgradeEffect(configEntries, options).pipe(Effect.flip, Effect.runPromise);

const runUpgradeSuccess = (
  configEntries: ReadonlyArray<[string, string]>,
  options?: {
    prerelease?: boolean;
  }
) => makeUpgradeEffect(configEntries, options).pipe(Effect.runPromise);

describe('UpgradeBinary', () => {
  it('wraps non-2xx releases fetch failures with fetch context (no tag branch)', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    try {
      await withHttpServer(
        (_req, res) => {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ message: 'rate limited' }));
        },
        async apiBaseUrl => {
          const error = await runUpgrade([
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
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('wraps tagged release JSON parse failures with parse context (tag branch)', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    try {
      await withHttpServer(
        (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('not-json');
        },
        async apiBaseUrl => {
          const error = await runUpgrade([
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
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('URL-encodes slash-containing tags in tagged release request path', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });
    let receivedPath = '';

    try {
      await withHttpServer(
        (req, res) => {
          receivedPath = req.url ?? '';
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ message: 'forced failure' }));
        },
        async apiBaseUrl => {
          const tag = '@composio/cli@0.1.24';
          const error = await runUpgrade([
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
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('skips newer releases that do not contain a binary for the current platform', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    try {
      await withHttpServer(
        (_req, res) => {
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
        },
        async apiBaseUrl => {
          const result = await runUpgradeSuccess([
            ['GITHUB_API_BASE_URL', apiBaseUrl],
            ['GITHUB_OWNER', 'test-owner'],
            ['GITHUB_REPO', 'test-repo'],
          ]);

          expect(result).toBeUndefined();
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('ignores prereleases when checking the stable channel', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    try {
      await withHttpServer(
        (_req, res) => {
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
        },
        async apiBaseUrl => {
          const result = await runUpgradeSuccess([
            ['GITHUB_API_BASE_URL', apiBaseUrl],
            ['GITHUB_OWNER', 'test-owner'],
            ['GITHUB_REPO', 'test-repo'],
          ]);

          expect(result).toBeUndefined();
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('selects the latest prerelease when beta upgrades are requested', async () => {
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });

    try {
      await withHttpServer(
        (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify([
              {
                tag_name: '@composio/cli@0.2.18-beta.1',
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
                tag_name: '@composio/cli@0.2.18-beta.3',
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
        },
        async apiBaseUrl => {
          const error = await runUpgrade(
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
        }
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('uses the installed beta release tag when comparing beta updates', async () => {
    const installDir = mkdtempSync(path.join(tmpdir(), 'composio-beta-upgrade-'));
    const fakeExecPath = path.join(installDir, 'composio');
    writeFileSync(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.2.17-beta.1\n');
    vi.stubGlobal('Bun', { which: vi.fn(() => null) });
    const execPathSpy = vi.spyOn(process, 'execPath', 'get').mockReturnValue(fakeExecPath);

    try {
      await withHttpServer(
        (_req, res) => {
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
        },
        async apiBaseUrl => {
          const error = await runUpgrade(
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
        }
      );
    } finally {
      execPathSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
