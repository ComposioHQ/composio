import { Data, Effect, Config, Option } from 'effect';
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
import { TerminalUI } from './terminal-ui';
import { RUN_COMPANION_MODULE_FILENAMES } from './run-companion-modules';

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
  prerelease?: boolean;
  draft?: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
};

const CLI_RELEASE_TAG_PATTERN = /^@composio\/cli@\d+\.\d+\.\d+.*$/;

// Service to manage CLI binary upgrades
export class UpgradeBinary extends Effect.Service<UpgradeBinary>()('services/UpgradeBinary', {
  accessors: true,
  // eslint-disable-next-line max-lines-per-function
  effect: Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const githubConfig = yield* Config.all(GITHUB_CONFIG);

    /**
     * Fetch latest release from GitHub
     */
    const fetchGitHubJson = <T>({
      url,
      fetchErrorMessage,
      parseErrorMessage,
    }: {
      url: string;
      fetchErrorMessage: string;
      parseErrorMessage: string;
    }): Effect.Effect<T, UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`GET ${url}`);

        const response = yield* httpClient.get(url).pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error,
                message: fetchErrorMessage,
              })
            )
          )
        );

        if (response.status < 200 || response.status >= 300) {
          const pretty = yield* response.json.pipe(
            Effect.map(json => renderPrettyError(Object.entries(json as object))),
            Effect.catchAll(() => Effect.succeed(''))
          );

          const cause = pretty ? `HTTP ${response.status}\n${pretty}` : `HTTP ${response.status}`;
          return yield* Effect.fail(
            new UpgradeBinaryError({
              cause,
              message: fetchErrorMessage,
            })
          );
        }

        return (yield* response.json.pipe(
          Effect.catchAll(error =>
            Effect.fail(
              new UpgradeBinaryError({
                cause: error,
                message: parseErrorMessage,
              })
            )
          )
        )) as T;
      });

    const fetchLatestRelease = (): Effect.Effect<GitHubRelease, UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        const release = yield* githubConfig.TAG.pipe(
          Option.match({
            onNone: Effect.fn(function* () {
              yield* Effect.logDebug(
                'No tag specified, resolving latest package-scoped CLI release'
              );
              const url = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases?per_page=100`;
              const releases = yield* fetchGitHubJson<unknown>({
                url,
                fetchErrorMessage: 'Failed to fetch releases from GitHub',
                parseErrorMessage: 'Failed to parse GitHub releases JSON response',
              });

              if (!Array.isArray(releases)) {
                return yield* Effect.fail(
                  new UpgradeBinaryError({
                    cause: new Error('GitHub releases response was not an array'),
                    message: 'Unexpected response while resolving latest CLI release',
                  })
                );
              }

              const cliReleases = releases.filter(
                (release): release is GitHubRelease =>
                  typeof release === 'object' &&
                  release !== null &&
                  'tag_name' in release &&
                  typeof release.tag_name === 'string' &&
                  ('prerelease' in release ? release.prerelease === false : true) &&
                  ('draft' in release ? release.draft === false : true) &&
                  CLI_RELEASE_TAG_PATTERN.test(release.tag_name)
              );

              if (cliReleases.length === 0) {
                return yield* Effect.fail(
                  new UpgradeBinaryError({
                    cause: new Error('No package-scoped CLI releases found'),
                    message:
                      'Failed to determine latest CLI release from @composio/cli tags on GitHub',
                  })
                );
              }

              let latest = cliReleases[0];
              for (const release of cliReleases.slice(1)) {
                const comparison = yield* semverComparator(latest.tag_name, release.tag_name).pipe(
                  Effect.mapError(
                    error =>
                      new UpgradeBinaryError({
                        cause: error,
                        message: 'Failed to compare CLI release versions',
                      })
                  )
                );

                if (comparison < 0) {
                  latest = release;
                }
              }

              yield* Effect.logDebug(`Resolved latest CLI release tag: ${latest.tag_name}`);
              return latest;
            }),
            onSome: Effect.fn(function* (tag) {
              yield* Effect.logDebug(`Using tag: ${tag}`);
              const encodedTag = encodeURIComponent(tag);
              const url = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases/tags/${encodedTag}`;
              const release = yield* fetchGitHubJson<GitHubRelease>({
                url,
                fetchErrorMessage: `Failed to fetch tags/${tag} release from GitHub`,
                parseErrorMessage: 'Failed to parse GitHub release JSON response',
              });

              return release as GitHubRelease;
            }),
          })
        );
        return release;
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

        yield* Effect.logDebug(`Downloading ${asset.name}...`);

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
     * Fetch checksums.txt from a release, if available.
     * Returns the parsed map of filename -> expected SHA-256 hash, or None if not found.
     */
    const fetchChecksums = (
      release: GitHubRelease
    ): Effect.Effect<Option.Option<Map<string, string>>, never, never> =>
      Effect.gen(function* () {
        const checksumsAsset = release.assets.find(a => a.name === 'checksums.txt');
        if (!checksumsAsset) {
          yield* Effect.logDebug('No checksums.txt found in release assets');
          return Option.none();
        }

        const response = yield* httpClient
          .get(checksumsAsset.browser_download_url)
          .pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (!response || response.status < 200 || response.status >= 300) {
          yield* Effect.logDebug('Failed to download checksums.txt');
          return Option.none();
        }

        const text = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed('')));
        if (!text) {
          return Option.none();
        }

        const checksums = new Map<string, string>();
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // Format: "<hash>  <filename>" (two spaces, sha256sum compatible)
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            checksums.set(parts[1], parts[0]);
          }
        }

        return Option.some(checksums);
      });

    /**
     * Verify SHA-256 checksum of downloaded data against expected hash.
     */
    const verifyChecksum = (
      data: Uint8Array,
      expectedHash: string,
      fileName: string
    ): Effect.Effect<void, UpgradeBinaryError> =>
      Effect.gen(function* () {
        const hashBuffer = yield* Effect.tryPromise({
          try: () => {
            // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer type incompatibility
            const buf = new ArrayBuffer(data.byteLength);
            new Uint8Array(buf).set(data);
            return crypto.subtle.digest('SHA-256', buf);
          },
          catch: error =>
            new UpgradeBinaryError({
              cause: error as Error,
              message: 'Failed to compute SHA-256 checksum',
            }),
        });

        const actual = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        if (actual !== expectedHash) {
          return yield* Effect.fail(
            new UpgradeBinaryError({
              message: `Checksum mismatch for ${fileName}\n  Expected: ${expectedHash}\n  Actual:   ${actual}`,
            })
          );
        }

        yield* Effect.logDebug(`Checksum verified for ${fileName}`);
      });

    /**
     * Extract binary from zip archive using FileSystem
     */
    const extractBinary = (
      { name, data }: { name: string; data: Uint8Array },
      tempDir: string
    ): Effect.Effect<{ binaryPath: string; packageDir: string }, UpgradeBinaryError, never> =>
      Effect.gen(function* () {
        const zipPath = path.join(tempDir, name);
        const extractDir = path.join(tempDir, 'extract');
        const packageDir = path.join(extractDir, path.parse(name).name);
        const binaryPath = path.join(packageDir, CLI_BINARY_NAME);

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

        return {
          binaryPath,
          packageDir,
        };
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

        const sourceDirectory = path.dirname(sourcePath);
        const targetDirectory = path.dirname(targetPath);

        for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
          const sourceCompanion = path.join(sourceDirectory, fileName);
          const sourceExists = yield* fs
            .exists(sourceCompanion)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));

          if (!sourceExists) {
            return yield* Effect.fail(
              new UpgradeBinaryError({
                cause: new Error(`Missing companion module: ${sourceCompanion}`),
                message: 'Downloaded binary package is incomplete',
              })
            );
          }

          yield* fs
            .copy(sourceCompanion, path.join(targetDirectory, fileName), {
              overwrite: true,
            })
            .pipe(
              Effect.catchAll(error =>
                Effect.fail(
                  new UpgradeBinaryError({
                    cause: error as Error,
                    message: `Failed to replace companion module: ${fileName}`,
                  })
                )
              )
            );
        }
      });

    /**
     * Main upgrade function
     */
    const upgrade = () =>
      Effect.gen(function* () {
        const ui = yield* TerminalUI;
        const upgradeTargetOpt = yield* DEBUG_OVERRIDE_CONFIG['UPGRADE_TARGET'];
        const currentPath = yield* getCurrentExecutablePath();
        yield* Effect.logDebug(`Current executable path: ${currentPath}`);

        yield* ui.intro('composio upgrade');

        // If local binary path is provided (for testing), use it directly
        if (Option.isSome(upgradeTargetOpt)) {
          yield* ui.log.info(`New local version available (current: ${APP_VERSION})`);
          yield* replaceBinary(upgradeTargetOpt.value, currentPath);
          yield* ui.outro('Upgrade completed');
          return undefined;
        }

        const didUpgrade = yield* ui.useMakeSpinner('Checking for updates...', spinner =>
          Effect.gen(function* () {
            const release = yield* fetchLatestRelease();
            const updateAvailable = yield* isUpdateAvailable(release);
            if (!updateAvailable) {
              yield* spinner.stop('You are already running the latest version!');
              return false;
            }

            yield* spinner.message(
              `New version available: ${release.tag_name} (current: ${APP_VERSION}). Downloading...`
            );

            const platformArch = yield* detectPlatform;
            const { name, data } = yield* downloadBinary(release, platformArch);

            yield* spinner.message('Verifying checksum...');

            const checksums = yield* fetchChecksums(release);
            if (Option.isSome(checksums)) {
              const expectedHash = checksums.value.get(name);
              if (expectedHash) {
                yield* verifyChecksum(data, expectedHash, name);
              } else {
                yield* Effect.logDebug(
                  `No checksum entry found for ${name} — skipping verification`
                );
              }
            }

            yield* spinner.message('Extracting...');

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

            const extractedBinary = yield* extractBinary({ name, data }, tmpDir);
            yield* replaceBinary(extractedBinary.binaryPath, currentPath);

            yield* spinner.stop('Upgrade completed!');
            return release.tag_name;
          })
        );

        yield* ui.outro(
          didUpgrade ? 'Restart your terminal to use the new version.' : 'No upgrade needed.'
        );

        return didUpgrade || undefined; // release tag string, or undefined if no upgrade
      });

    return {
      upgrade,
    } as const;
  }),
  dependencies: [],
}) {}
