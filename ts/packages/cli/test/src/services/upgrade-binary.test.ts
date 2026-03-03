import { describe, expect, it, vi } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { APP_VERSION } from 'src/constants';
import { TerminalUI } from 'src/services/terminal-ui';
import { UpgradeBinary, UpgradeBinaryError } from 'src/services/upgrade-binary';
import { NodeOs } from 'src/services/node-os';

// ─── Synthetic GitHub API data ────────────────────────────────────────────────
//
// These fixtures mirror the real GitHub releases API response shape used by
// `fetchLatestReleaseWithRequiredAssets` and `fetchLatestRelease`.

type GitHubReleaseFixture = {
  tag_name: string;
  prerelease?: boolean;
  draft?: boolean;
  assets: Array<{ name: string; browser_download_url: string }>;
};

const ALL_PLATFORMS = ['darwin-aarch64', 'darwin-x64', 'linux-aarch64', 'linux-x64'] as const;

/**
 * Build a synthetic GitHub release payload that matches the real GitHub API
 * response shape used by the upgrade service. Defaults to including binary
 * assets for all supported platforms.
 *
 * @param version Semver string (e.g. '0.2.0') — wrapped into '@composio/cli@<version>'
 * @param opts.platforms Platforms to include binaries for (default: all four)
 * @param opts.prerelease Whether this is a pre-release (default: false)
 * @param opts.draft Whether this is a draft (default: false)
 * @param opts.downloadBaseUrl Base URL for browser_download_url assets
 */
const makeRelease = (
  version: string,
  opts: {
    platforms?: ReadonlyArray<string>;
    prerelease?: boolean;
    draft?: boolean;
    downloadBaseUrl?: string;
  } = {}
): GitHubReleaseFixture => {
  const {
    platforms = ALL_PLATFORMS,
    prerelease = false,
    draft = false,
    downloadBaseUrl = 'https://example.com',
  } = opts;
  return {
    tag_name: `@composio/cli@${version}`,
    prerelease,
    draft,
    assets: platforms.map(platform => ({
      name: `composio-${platform}.zip`,
      browser_download_url: `${downloadBaseUrl}/composio-${platform}.zip`,
    })),
  };
};

// ─── Test infrastructure ──────────────────────────────────────────────────────

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

// darwin / arm64 → detectPlatform maps to { platform: 'darwin', arch: 'aarch64' }
// Binary asset name: composio-darwin-aarch64.zip
const NodeOsTest = Layer.succeed(
  NodeOs,
  new NodeOs({
    homedir: '/tmp',
    platform: 'darwin',
    arch: 'arm64',
  })
);

const withHttpServer = async (
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (apiBaseUrl: string) => Promise<void>
) => {
  const server = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host: '127.0.0.1' }, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to bind test server to an ephemeral port');
  }

  const apiBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(apiBaseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
};

/** Run the upgrade command and return the typed error (upgrade must fail). */
const runUpgradeExpectError = (configEntries: ReadonlyArray<[string, string]>) =>
  Effect.gen(function* () {
    const service = yield* UpgradeBinary;
    return yield* Effect.flip(service.upgrade());
  }).pipe(
    Effect.provide(UpgradeBinary.Default),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(BunFileSystem.layer),
    Effect.provide(TerminalUINoop),
    Effect.provide(NodeOsTest),
    Effect.withConfigProvider(ConfigProvider.fromMap(new Map(configEntries))),
    Effect.scoped,
    Effect.runPromise
  );

/** Run the upgrade command and expect it to complete successfully. */
const runUpgradeExpectSuccess = (configEntries: ReadonlyArray<[string, string]>) =>
  Effect.gen(function* () {
    const service = yield* UpgradeBinary;
    yield* service.upgrade();
  }).pipe(
    Effect.provide(UpgradeBinary.Default),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(BunFileSystem.layer),
    Effect.provide(TerminalUINoop),
    Effect.provide(NodeOsTest),
    Effect.withConfigProvider(ConfigProvider.fromMap(new Map(configEntries))),
    Effect.scoped,
    Effect.runPromise
  );

const baseConfig = (apiBaseUrl: string): ReadonlyArray<[string, string]> => [
  ['GITHUB_API_BASE_URL', apiBaseUrl],
  ['GITHUB_OWNER', 'test-owner'],
  ['GITHUB_REPO', 'test-repo'],
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UpgradeBinary', () => {
  // ── Release list fetching (no GITHUB_TAG set → fetchLatestReleaseWithRequiredAssets) ──

  describe('release list fetching (no GITHUB_TAG)', () => {
    it('wraps non-2xx releases fetch failures with fetch context', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ message: 'rate limited' }));
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe('Failed to fetch releases from GitHub');
            expect(String(error.cause)).toContain('HTTP 500');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('wraps releases JSON parse failures with parse context', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.end('not-valid-json{{{');
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe('Failed to parse GitHub releases JSON response');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('fails when GitHub returns a non-array releases body', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // Real API returns an array; this simulates an unexpected object shape
            const body = { total_count: 0, items: [] };
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe('Unexpected response while resolving latest CLI release');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('fails when no @composio/cli-scoped release exists in the list', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // All releases belong to other packages — filtered out by CLI tag pattern
            const releases: GitHubReleaseFixture[] = [
              { tag_name: '@composio/core@1.4.0', assets: [] },
              { tag_name: '@composio/openai@1.0.0', assets: [] },
              { tag_name: 'v2.0.0', assets: [] }, // bare version, not a CLI tag
            ];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(releases));
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe(
              'Failed to determine latest CLI release from @composio/cli tags on GitHub'
            );
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('filters out prerelease releases when searching for the latest CLI release', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // All CLI releases are marked prerelease — none should pass the filter
            const releases = [
              makeRelease('0.2.0-beta.1', { prerelease: true }),
              makeRelease('0.2.0-alpha.3', { prerelease: true }),
            ];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(releases));
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe(
              'Failed to determine latest CLI release from @composio/cli tags on GitHub'
            );
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('filters out draft releases when searching for the latest CLI release', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // All CLI releases are drafts — none should pass the filter
            const releases = [
              makeRelease('0.2.0', { draft: true }),
              makeRelease('0.2.1', { draft: true }),
            ];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(releases));
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe(
              'Failed to determine latest CLI release from @composio/cli tags on GitHub'
            );
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('fails when no CLI release has a binary for the current platform', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // Releases only ship linux binaries — no darwin-aarch64 (our test platform)
            const releases = [
              makeRelease('0.2.0', { platforms: ['linux-x64', 'linux-aarch64'] }),
              makeRelease('0.1.31', { platforms: ['linux-x64'] }),
            ];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(releases));
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe('No binary available for darwin-aarch64');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('selects the newest release that has the required platform binary', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      // Tracks the download URL path requested by the upgrade service
      let capturedDownloadPath = '';
      // Set before any HTTP request is made; used by the releases handler to embed
      // correct browser_download_url values pointing at the local test server
      let serverBaseUrl = '';

      try {
        await withHttpServer(
          (req, res) => {
            if (req.url?.includes('releases?')) {
              // 0.3.0 — linux only (no darwin-aarch64), so it must be SKIPPED
              // 0.2.1 — all platforms (newer than 0.2.0, should be SELECTED)
              // 0.2.0 — all platforms (older)
              // Expected: scan picks 0.2.1 as the newest with darwin-aarch64
              const releases: GitHubReleaseFixture[] = [
                makeRelease('0.2.0', {
                  platforms: [...ALL_PLATFORMS],
                  downloadBaseUrl: `${serverBaseUrl}/release-0.2.0`,
                }),
                makeRelease('0.3.0', {
                  platforms: ['linux-x64', 'linux-aarch64'],
                  downloadBaseUrl: `${serverBaseUrl}/release-0.3.0`,
                }),
                makeRelease('0.2.1', {
                  platforms: [...ALL_PLATFORMS],
                  downloadBaseUrl: `${serverBaseUrl}/release-0.2.1`,
                }),
              ];
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify(releases));
            } else {
              capturedDownloadPath = req.url ?? '';
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ message: 'download intentionally blocked for test' }));
            }
          },
          async apiBaseUrl => {
            serverBaseUrl = apiBaseUrl; // set before any HTTP requests are made

            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;

            // The scan should have selected 0.2.1 (newest with darwin-aarch64)
            // and attempted to download its binary
            expect(capturedDownloadPath).toContain('release-0.2.1');
            expect(capturedDownloadPath).toContain('composio-darwin-aarch64.zip');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('skips a newer release that lacks the required platform binary and picks the next best', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      let capturedDownloadPath = '';
      let serverBaseUrl = '';

      try {
        await withHttpServer(
          (req, res) => {
            if (req.url?.includes('releases?')) {
              // 0.3.0 is the newest but has NO darwin-aarch64 binary
              // 0.2.5 has all platforms and should be selected instead
              const releases: GitHubReleaseFixture[] = [
                makeRelease('0.3.0', {
                  platforms: ['linux-x64', 'linux-aarch64', 'darwin-x64'],
                  downloadBaseUrl: `${serverBaseUrl}/release-0.3.0`,
                }),
                makeRelease('0.2.5', {
                  platforms: [...ALL_PLATFORMS],
                  downloadBaseUrl: `${serverBaseUrl}/release-0.2.5`,
                }),
              ];
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify(releases));
            } else {
              capturedDownloadPath = req.url ?? '';
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ message: 'download intentionally blocked for test' }));
            }
          },
          async apiBaseUrl => {
            serverBaseUrl = apiBaseUrl;

            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;

            // 0.3.0 must have been skipped; 0.2.5 must have been selected
            expect(capturedDownloadPath).toContain('release-0.2.5');
            expect(capturedDownloadPath).toContain('composio-darwin-aarch64.zip');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('reports no upgrade needed when already on the latest version', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // Return only the current version — no newer release available
            const releases = [makeRelease(APP_VERSION)];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(releases));
          },
          async apiBaseUrl => {
            // Should resolve without error: no download attempted
            await expect(runUpgradeExpectSuccess(baseConfig(apiBaseUrl))).resolves.toBeUndefined();
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('reports no upgrade needed when running a newer version than any release', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // All available releases are older than the running version
            const releases = [makeRelease('0.1.0'), makeRelease('0.1.1')];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(releases));
          },
          async apiBaseUrl => {
            await expect(runUpgradeExpectSuccess(baseConfig(apiBaseUrl))).resolves.toBeUndefined();
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('mixes prerelease, draft, and non-CLI releases and still fails when none pass the filter', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            const releases: GitHubReleaseFixture[] = [
              makeRelease('0.2.0-beta.1', { prerelease: true }),
              makeRelease('0.2.0', { draft: true }),
              { tag_name: '@composio/core@1.5.0', assets: [] },
            ];
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(releases));
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe(
              'Failed to determine latest CLI release from @composio/cli tags on GitHub'
            );
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });
  });

  // ── Tagged release fetching (GITHUB_TAG set → fetchLatestRelease) ───────────

  describe('tagged release fetching (GITHUB_TAG set)', () => {
    it('wraps non-2xx tagged release fetch failures with fetch context', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ message: 'Not Found' }));
          },
          async apiBaseUrl => {
            const tag = '@composio/cli@0.1.24';
            const error = await runUpgradeExpectError([
              ...baseConfig(apiBaseUrl),
              ['GITHUB_TAG', tag],
            ]);

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe(`Failed to fetch tags/${tag} release from GitHub`);
            expect(String(error.cause)).toContain('HTTP 404');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('wraps tagged release JSON parse failures with parse context', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('not-json');
          },
          async apiBaseUrl => {
            const error = await runUpgradeExpectError([
              ...baseConfig(apiBaseUrl),
              ['GITHUB_TAG', 'v9.9.9'],
            ]);

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe('Failed to parse GitHub release JSON response');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('URL-encodes slash-containing tags in the release request path', async () => {
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
            const error = await runUpgradeExpectError([
              ...baseConfig(apiBaseUrl),
              ['GITHUB_TAG', tag],
            ]);

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
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

    it('reports no upgrade needed when the pinned tag matches the running version', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // Serve a release whose version equals the running APP_VERSION
            const release = makeRelease(APP_VERSION);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(release));
          },
          async apiBaseUrl => {
            await expect(
              runUpgradeExpectSuccess([
                ...baseConfig(apiBaseUrl),
                ['GITHUB_TAG', `@composio/cli@${APP_VERSION}`],
              ])
            ).resolves.toBeUndefined();
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('reports no upgrade needed when the pinned tag is older than the running version', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });

      try {
        await withHttpServer(
          (_req, res) => {
            // Serve an older release
            const release = makeRelease('0.1.0');
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(release));
          },
          async apiBaseUrl => {
            await expect(
              runUpgradeExpectSuccess([
                ...baseConfig(apiBaseUrl),
                ['GITHUB_TAG', '@composio/cli@0.1.0'],
              ])
            ).resolves.toBeUndefined();
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('proceeds with download when the pinned tag is newer than the running version', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });
      let capturedDownloadPath = '';
      let serverBaseUrl = '';

      try {
        await withHttpServer(
          (req, res) => {
            if (req.url?.includes('/releases/tags/')) {
              // Serve a newer release whose binary download will point back at this server
              const release = makeRelease('99.0.0', {
                downloadBaseUrl: `${serverBaseUrl}/release-99.0.0`,
              });
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify(release));
            } else {
              capturedDownloadPath = req.url ?? '';
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ message: 'download intentionally blocked for test' }));
            }
          },
          async apiBaseUrl => {
            serverBaseUrl = apiBaseUrl;

            const error = await runUpgradeExpectError([
              ...baseConfig(apiBaseUrl),
              ['GITHUB_TAG', '@composio/cli@99.0.0'],
            ]);

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            // A download was attempted for the newer release
            expect(capturedDownloadPath).toContain('release-99.0.0');
            expect(capturedDownloadPath).toContain('composio-darwin-aarch64.zip');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });
  });

  // ── getCurrentExecutablePath ─────────────────────────────────────────────────

  describe('getCurrentExecutablePath', () => {
    it('fails when the Composio CLI is being run via the Bun runtime', async () => {
      // Bun.which('bun') returns the current process.execPath → matches the runtime check
      vi.stubGlobal('Bun', { which: vi.fn(name => (name === 'bun' ? process.execPath : null)) });

      try {
        const error = await runUpgradeExpectError([
          ['GITHUB_API_BASE_URL', 'http://127.0.0.1:0'],
          ['GITHUB_OWNER', 'test'],
          ['GITHUB_REPO', 'test'],
        ]);

        expect(error).toBeInstanceOf(UpgradeBinaryError);
        if (!(error instanceof UpgradeBinaryError)) throw error;
        expect(error.message).toContain('Cannot upgrade runtime binary');
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('fails when the Composio CLI is being run via the Node.js runtime', async () => {
      // Bun.which('node') returns the current process.execPath → matches the runtime check
      vi.stubGlobal('Bun', { which: vi.fn(name => (name === 'node' ? process.execPath : null)) });

      try {
        const error = await runUpgradeExpectError([
          ['GITHUB_API_BASE_URL', 'http://127.0.0.1:0'],
          ['GITHUB_OWNER', 'test'],
          ['GITHUB_REPO', 'test'],
        ]);

        expect(error).toBeInstanceOf(UpgradeBinaryError);
        if (!(error instanceof UpgradeBinaryError)) throw error;
        expect(error.message).toContain('Cannot upgrade runtime binary');
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });
  });

  // ── Binary download failures ──────────────────────────────────────────────

  describe('binary download', () => {
    it('wraps non-2xx binary download failures with context', async () => {
      vi.stubGlobal('Bun', { which: vi.fn(() => null) });
      let serverBaseUrl = '';

      try {
        await withHttpServer(
          (req, res) => {
            if (req.url?.includes('releases?')) {
              const release = makeRelease('99.0.0', {
                downloadBaseUrl: `${serverBaseUrl}/download`,
              });
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify([release]));
            } else {
              // Simulate a failed asset download
              res.writeHead(403, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ message: 'Forbidden' }));
            }
          },
          async apiBaseUrl => {
            serverBaseUrl = apiBaseUrl;

            const error = await runUpgradeExpectError(baseConfig(apiBaseUrl));

            expect(error).toBeInstanceOf(UpgradeBinaryError);
            if (!(error instanceof UpgradeBinaryError)) throw error;
            expect(error.message).toBe('Failed to download binary: composio-darwin-aarch64.zip');
          }
        );
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });
  });
});
