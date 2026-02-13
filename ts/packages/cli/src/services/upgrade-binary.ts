import { Data, Effect, Console, Config, Option } from 'effect';
import { HttpClient, FileSystem } from '@effect/platform';
import * as path from 'node:path';
import { APP_VERSION } from '../constants';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { detectPlatform, type PlatformArch } from 'src/effects/detect-platform';
import { CompareSemverError, semverComparator } from 'src/effects/compare-semver';

// Note: `node:zlib` does not support Github's zip files
import decompress from 'decompress';
import type { Predicate } from 'effect/Predicate';
import { renderPrettyError } from './utils/pretty-error';

export class UpgradeBinaryError extends Data.TaggedError('services/UpgradeBinaryError')<{
  readonly cause?: unknown;
  readonly message?: string;
}> {}

/**
 * CLI binary name constant
 */
export const CLI_BINARY_NAME = 'composio';

type GitHubRelease = {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
};

// Service to manage CLI binary upgrades
export class UpgradeBinary extends Effect.Service<UpgradeBinary>()('services/UpgradeBinary', {
  accessors: true,
  // eslint-disable-next-line max-lines-per-function
  effect: Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const githubConfig = yield* Config.all(GITHUB_CONFIG);

    /**
     * Check if a tag matches the CLI release channel (cli-v* or v*)
     */
    const isCliReleaseTag = (tag: string): boolean => tag.startsWith('cli-v') || /^v\d+/.test(tag);

    /**
     * Fetch a specific release by tag from GitHub
     */
    const fetchReleaseByTag = (
      tag: string
    ): Effect.Effect<GitHubRelease, UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        const url = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases/tags/${tag}`;
        yield* Effect.logDebug(`GET ${url}`);

        const response = yield* Effect.gen(function* () {
          const resp = yield* httpClient.get(url);
          if (resp.status < 200 || resp.status >= 300) {
            const json = yield* resp.json;
            const keyValues = Object.entries(json as object);
            const pretty = renderPrettyError(keyValues);
            return yield* Effect.fail(
              new UpgradeBinaryError({
                cause: `HTTP ${resp.status}\n${pretty}`,
              })
            );
          }
          return resp;
        }).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error,
                message: `Failed to fetch release ${tag} from GitHub`,
              })
            )
          )
        );

        const release = yield* Effect.gen(function* () {
          return yield* response.json;
        }).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error,
                message: 'Failed to parse GitHub release JSON response',
              })
            )
          )
        );

        return release as GitHubRelease;
      });

    /**
     * Fetch the latest CLI release from GitHub.
     *
     * When no explicit tag is set, queries recent releases and finds the first
     * cli-v* or v* release that has binary assets for the current platform.
     */
    const fetchLatestRelease = (
      platformArch: PlatformArch
    ): Effect.Effect<GitHubRelease, UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        // If an explicit tag is provided, use it directly
        if (Option.isSome(githubConfig.TAG)) {
          const tag = githubConfig.TAG.value;
          yield* Effect.logDebug(`Using explicit tag: ${tag}`);
          return yield* fetchReleaseByTag(tag);
        }

        yield* Effect.logDebug('Searching recent releases for CLI binaries...');
        const url = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases?per_page=20`;
        yield* Effect.logDebug(`GET ${url}`);

        const response = yield* Effect.gen(function* () {
          const resp = yield* httpClient.get(url);
          if (resp.status < 200 || resp.status >= 300) {
            return yield* Effect.fail(
              new UpgradeBinaryError({
                message: `Failed to fetch releases from GitHub (HTTP ${resp.status})`,
              })
            );
          }
          return resp;
        }).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error,
                message: 'Failed to fetch releases from GitHub',
              })
            )
          )
        );

        const releases = yield* Effect.gen(function* () {
          return yield* response.json;
        }).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error,
                message: 'Failed to parse GitHub releases JSON response',
              })
            )
          )
        );

        const allReleases = releases as GitHubRelease[];
        const binaryName = `${CLI_BINARY_NAME}-${platformArch.platform}-${platformArch.arch}.zip`;

        // Find the first CLI release that has the matching platform asset
        for (const release of allReleases) {
          if (!isCliReleaseTag(release.tag_name)) continue;
          const hasAsset = release.assets.some(asset => asset.name === binaryName);
          if (hasAsset) {
            yield* Effect.logDebug(`Found CLI release ${release.tag_name} with ${binaryName}`);
            return release;
          }
          yield* Effect.logDebug(
            `Release ${release.tag_name} missing ${binaryName}, trying previous...`
          );
        }

        return yield* Effect.fail(
          new UpgradeBinaryError({
            message: `No CLI release found with ${binaryName} in the last 20 releases`,
          })
        );
      });

    /**
     * Check if update is available
     */
    const isUpdateAvailable = (
      release: GitHubRelease
    ): Effect.Effect<boolean, CompareSemverError | UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        // Current version is older than latest
        const isVersionOutdated: Predicate<number> = comparison => comparison < 0;
        const comparison = yield* semverComparator(APP_VERSION, release.tag_name);
        return isVersionOutdated(comparison);
      });

    /**
     * Download binary for current platform
     */
    const downloadBinary = (
      release: GitHubRelease,
      platformArch: PlatformArch
    ): Effect.Effect<{ name: string; data: Uint8Array }, UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        yield* Effect.logDebug(
          `Looking up binary for ${platformArch.platform}-${platformArch.arch}`
        );

        const binaryName = `${CLI_BINARY_NAME}-${platformArch.platform}-${platformArch.arch}.zip`;

        const asset = release.assets.find(asset => asset.name === binaryName);
        if (!asset) {
          return yield* Effect.fail(
            new UpgradeBinaryError({
              cause: new Error(`Binary not found: ${binaryName}`),
              message: `No binary available for ${platformArch.platform}-${platformArch.arch}`,
            })
          );
        }

        yield* Console.log(`Downloading ${asset.name}...`);

        const response = yield* Effect.gen(function* () {
          const resp = yield* httpClient.get(asset.browser_download_url);
          if (resp.status < 200 || resp.status >= 300) {
            return yield* Effect.fail(
              new UpgradeBinaryError({
                cause: new Error(`HTTP ${resp.status}`),
                message: `Failed to download binary: ${asset.name}`,
              })
            );
          }
          return resp;
        }).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: new Error(String(error)),
                message: `Failed to download binary: ${asset.name}`,
              })
            )
          )
        );

        const arrayBuffer = yield* Effect.gen(function* () {
          return yield* response.arrayBuffer;
        }).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error as Error,
                message: 'Failed to read downloaded binary',
              })
            )
          )
        );

        return {
          name: binaryName,
          data: new Uint8Array(arrayBuffer),
        };
      });

    /**
     * Extract binary from zip archive using FileSystem
     */
    const extractBinary = (
      { name, data }: { name: string; data: Uint8Array },
      tempDir: string
    ): Effect.Effect<string, UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        const zipPath = path.join(tempDir, name);
        const extractDir = path.join(tempDir, 'extract');
        const binaryPath = path.join(extractDir, path.parse(name).name, CLI_BINARY_NAME);

        yield* Effect.logDebug(`Download zip to ${extractDir}`);

        // Write zip file
        yield* fs.writeFile(zipPath, data).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error as Error,
                message: 'Failed to write zip file',
              })
            )
          )
        );

        // Create extract directory
        yield* fs.makeDirectory(extractDir, { recursive: true }).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error as Error,
                message: 'Failed to create extract directory',
              })
            )
          )
        );

        yield* Effect.tryPromise({
          try: async () => {
            await decompress(zipPath, extractDir);
          },
          catch: error =>
            new UpgradeBinaryError({
              cause: error as Error,
              message: 'Failed to extract zip archive',
            }),
        });

        // Check if binary exists
        const exists = yield* fs
          .exists(binaryPath)
          .pipe(Effect.catchAll(() => Effect.succeed(false)));

        if (!exists) {
          return yield* Effect.fail(
            new UpgradeBinaryError({
              cause: new Error(`Binary not found in archive: ${binaryPath}`),
              message: 'Extracted archive does not contain expected binary',
            })
          );
        }

        // Make executable
        yield* fs.chmod(binaryPath, 0o755).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error as Error,
                message: 'Failed to make binary executable',
              })
            )
          )
        );

        return binaryPath;
      });

    /**
     * Get current executable path
     */
    const getCurrentExecutablePath = Effect.fn(function* () {
      // E.g., ~/.composio/composio
      const currentPath = process.execPath;

      const runtimesPaths = [Bun.which('bun'), Bun.which('node')] as Array<string | null>;

      if (runtimesPaths.includes(currentPath)) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            cause: new Error(`Currently using Composio CLI via Bun or Node.js runtime`),
            message:
              'Cannot upgrade runtime binary. Please run the upgrade command from a self-contained Composio CLI binary.',
          })
        );
      }

      return currentPath;
    });

    /**
     * Replace current executable binary with the new target one.
     */
    const replaceBinary = (
      sourcePath: string,
      targetPath: string
    ): Effect.Effect<void, UpgradeBinaryError> =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`Replacing binary: ${sourcePath} -> ${targetPath}`);
        yield* fs
          .copy(sourcePath, targetPath, {
            // Note: without `overwrite: true`, the copy operation will silently bail out
            overwrite: true,
          })
          .pipe(
            Effect.catchAll(error =>
              Effect.fail(
                new UpgradeBinaryError({
                  cause: error as Error,
                  message: 'Failed to replace binary',
                })
              )
            )
          );
      });

    /**
     * Main upgrade function
     */
    const upgrade = () =>
      Effect.gen(function* () {
        const upgradeTargetOpt = yield* DEBUG_OVERRIDE_CONFIG['UPGRADE_TARGET'];
        const currentPath = yield* getCurrentExecutablePath();
        yield* Effect.logDebug(`Current executable path: ${currentPath}`);

        // If local binary path is provided (for testing), use it directly
        if (Option.isSome(upgradeTargetOpt)) {
          yield* Console.log(`📦 New local version available (current: ${APP_VERSION})`);
          yield* replaceBinary(upgradeTargetOpt.value, currentPath);
          return;
        }

        yield* Console.log('Checking for updates...');

        const platformArch = yield* detectPlatform;
        const release = yield* fetchLatestRelease(platformArch);
        const updateAvailable = yield* isUpdateAvailable(release);
        if (!updateAvailable) {
          yield* Console.log('✅ You are already running the latest version!');
          return;
        }

        yield* Console.log(
          `📦 New version available: ${release.tag_name} (current: ${APP_VERSION})`
        );

        const { name, data } = yield* downloadBinary(release, platformArch);

        // The temporary directory is automatically cleaned up
        const tmpDir = yield* fs
          .makeTempDirectoryScoped({ prefix: `${CLI_BINARY_NAME}-upgrade}` })
          .pipe(
            Effect.catchAll(error =>
              Effect.fail(
                new UpgradeBinaryError({
                  cause: error as Error,
                  message: 'Failed to create temporary directory',
                })
              )
            )
          );

        const extractedBinaryPath = yield* extractBinary({ name, data }, tmpDir);
        yield* replaceBinary(extractedBinaryPath, currentPath);

        yield* Console.log(`🎉 Upgrade completed! Restart your terminal to use the new version.`);
      });

    return {
      upgrade,
    } as const;
  }),
  dependencies: [],
}) {}
