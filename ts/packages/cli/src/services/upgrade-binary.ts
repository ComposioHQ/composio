import { Data, Effect, Config, Match, Option, Predicate, Record as EffectRecord } from 'effect';
import { HttpClient, HttpClientResponse, FileSystem, Path } from '@effect/platform';
import { APP_VERSION } from '../constants';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { detectPlatform, type PlatformArch } from 'src/effects/detect-platform';
import { CompareSemverError, semverComparator } from 'src/effects/compare-semver';
import { fetchLatestCliRelease, GitHubRelease } from 'src/effects/resolve-cli-release';
import { parseChecksumsText, sha256Hex } from 'src/utils/checksums';

// Note: `node:zlib` does not support Github's zip files
import extractZip from 'extract-zip';
import { renderPrettyError } from './utils/pretty-error';
import { TerminalUI } from './terminal-ui';
import {
  collectExpectedRunCompanionAssetRelativePaths,
  readInstalledReleaseTag,
  writeInstalledReleaseTag,
} from './run-companion-modules';

export class UpgradeBinaryError extends Data.TaggedError('services/UpgradeBinaryError')<{
  readonly cause?: unknown;
  readonly message?: string;
}> {}

class DirectoryRollbackError extends Data.TaggedError('services/DirectoryRollbackError')<{
  readonly backupDir: string;
  readonly rollbackCause: unknown;
  readonly swapCause: unknown;
}> {}

/**
 * CLI binary name constant
 */
export const CLI_BINARY_NAME = 'composio';
const LOCAL_TOOLS_BINARY_ASSET_DIRNAME = 'local-tools-binaries';

const getBinaryAssetName = (platformArch: PlatformArch) =>
  `${CLI_BINARY_NAME}-${platformArch.platform}-${platformArch.arch}.zip`;

const hasPlatformBinaryAsset = (release: GitHubRelease, platformArch: PlatformArch) =>
  release.assets.some(asset => asset.name === getBinaryAssetName(platformArch));

const GITHUB_CONFIG_ALL = Config.all(GITHUB_CONFIG);

// Dependencies resolved once at service construction time and threaded
// through the module-level helpers below.
export interface UpgradeBinaryContext {
  readonly httpClient: HttpClient.HttpClient;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly githubConfig: Config.Config.Success<typeof GITHUB_CONFIG_ALL>;
}

/**
 * Fetch latest release from GitHub
 */
const fetchGitHubRelease = (
  { githubConfig, httpClient }: UpgradeBinaryContext,
  tag: string
): Effect.Effect<GitHubRelease, UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    const encodedTag = encodeURIComponent(tag);
    const url = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases/tags/${encodedTag}`;
    const fetchErrorMessage = `Failed to fetch tags/${tag} release from GitHub`;
    yield* Effect.logDebug(`GET ${url}`);

    const response = yield* httpClient.get(url).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: fetchErrorMessage,
          })
      )
    );

    if (response.status < 200 || response.status >= 300) {
      const pretty = yield* response.json.pipe(
        Effect.map(json =>
          Predicate.isRecord(json) ? renderPrettyError(EffectRecord.toEntries(json)) : ''
        ),
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

    return yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to parse GitHub release JSON response',
          })
      )
    );
  });

const fetchLatestRelease = (
  ctx: UpgradeBinaryContext,
  platformArch: PlatformArch,
  options: {
    prerelease?: boolean;
    tag?: string;
  } = {}
): Effect.Effect<GitHubRelease, UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    const { githubConfig, httpClient } = ctx;
    const prerelease = options.prerelease ?? false;
    const explicitTag = options.tag ? Option.some(options.tag) : githubConfig.TAG;
    const release = yield* explicitTag.pipe(
      Option.match({
        onNone: Effect.fn(function* () {
          yield* Effect.logDebug(
            `No tag specified, resolving latest package-scoped CLI ${prerelease ? 'beta' : 'stable'} release`
          );
          const latest = yield* fetchLatestCliRelease({
            assetDescription: getBinaryAssetName(platformArch),
            channel: prerelease ? 'beta' : 'stable',
            githubConfig,
            hasRequiredAsset: release => hasPlatformBinaryAsset(release, platformArch),
            httpClient,
          }).pipe(
            Effect.mapError(
              error =>
                new UpgradeBinaryError({
                  cause: error,
                  message: Match.value(error.reason).pipe(
                    Match.when('request', () => 'Failed to fetch releases from GitHub'),
                    Match.when('http-status', () => 'Failed to fetch releases from GitHub'),
                    Match.when('decode', () => 'Failed to parse GitHub releases JSON response'),
                    Match.when(
                      'not-found',
                      () =>
                        `Failed to determine latest CLI ${prerelease ? 'beta' : 'stable'} release from @composio/cli tags on GitHub`
                    ),
                    Match.when(
                      'compare',
                      () =>
                        `Failed to determine latest CLI ${prerelease ? 'beta' : 'stable'} release from @composio/cli tags on GitHub`
                    ),
                    Match.exhaustive
                  ),
                })
            )
          );

          yield* Effect.logDebug(`Resolved latest CLI release tag: ${latest.tag_name}`);
          return latest;
        }),
        onSome: Effect.fn(function* (tag) {
          yield* Effect.logDebug(`Using tag: ${tag}`);
          const release = yield* fetchGitHubRelease(ctx, tag);

          return release;
        }),
      })
    );
    return release;
  });

const provideFsAndPath = <A, E>(
  { fs, path }: UpgradeBinaryContext,
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>
) =>
  effect.pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path)
  );

/**
 * Check if update is available
 */
const resolveCurrentReleaseIdentifier = (ctx: UpgradeBinaryContext, currentPath: string) =>
  provideFsAndPath(ctx, readInstalledReleaseTag(currentPath)).pipe(
    Effect.map(releaseTag => releaseTag || `@composio/cli@${APP_VERSION}`)
  );

const isUpdateAvailable = (
  release: GitHubRelease,
  currentReleaseIdentifier: string
): Effect.Effect<boolean, CompareSemverError | UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    // Current version is older than latest
    const isVersionOutdated = (comparison: number) => comparison < 0;
    const comparison = yield* semverComparator(currentReleaseIdentifier, release.tag_name);
    return isVersionOutdated(comparison);
  });

/**
 * Download binary for current platform
 */
export const downloadBinary = (
  { httpClient }: UpgradeBinaryContext,
  release: GitHubRelease,
  platformArch: PlatformArch
): Effect.Effect<{ name: string; data: Uint8Array }, UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Looking up binary for ${platformArch.platform}-${platformArch.arch}`);

    const binaryName = getBinaryAssetName(platformArch);

    const asset = release.assets.find(asset => asset.name === binaryName);
    if (!asset) {
      return yield* Effect.fail(
        new UpgradeBinaryError({
          cause: `Binary not found: ${binaryName}`,
          message: `No binary available for ${platformArch.platform}-${platformArch.arch}`,
        })
      );
    }

    yield* Effect.logDebug(`Downloading ${asset.name}...`);

    const response = yield* Effect.gen(function* () {
      const resp = yield* httpClient.get(asset.browser_download_url).pipe(
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({
              cause,
              message: `Failed to download binary: ${asset.name}`,
            })
        )
      );
      if (resp.status < 200 || resp.status >= 300) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            cause: `HTTP ${resp.status}`,
            message: `Failed to download binary: ${asset.name}`,
          })
        );
      }
      return resp;
    });

    const arrayBuffer = yield* Effect.gen(function* () {
      return yield* response.arrayBuffer;
    }).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to read downloaded binary',
          })
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
export const fetchChecksums = (
  { httpClient }: UpgradeBinaryContext,
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

    return Option.some(parseChecksumsText(text));
  });

/**
 * Verify SHA-256 checksum of downloaded data against expected hash.
 */
export const verifyChecksum = (
  data: Uint8Array,
  expectedHash: string,
  fileName: string
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const actual = yield* Effect.tryPromise({
      try: () => sha256Hex(data),
      catch: error =>
        new UpgradeBinaryError({
          cause: error,
          message: 'Failed to compute SHA-256 checksum',
        }),
    });

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
export const extractBinary = (
  { fs, path }: UpgradeBinaryContext,
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
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to write zip file',
          })
      )
    );

    // Create extract directory
    yield* fs.makeDirectory(extractDir, { recursive: true }).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to create extract directory',
          })
      )
    );

    yield* Effect.tryPromise({
      try: async () => {
        await extractZip(zipPath, { dir: extractDir });
      },
      catch: error =>
        new UpgradeBinaryError({
          cause: error,
          message: 'Failed to extract zip archive',
        }),
    });

    // Check if binary exists
    const exists = yield* fs.exists(binaryPath).pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!exists) {
      return yield* Effect.fail(
        new UpgradeBinaryError({
          cause: `Binary not found in archive: ${binaryPath}`,
          message: 'Extracted archive does not contain expected binary',
        })
      );
    }

    // Make executable
    yield* fs.chmod(binaryPath, 0o755).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to make binary executable',
          })
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
export const getCurrentExecutablePath = Effect.fn(function* () {
  // E.g., ~/.composio/composio
  const currentPath = process.execPath;

  const runtimesPaths: Array<string | null> = [Bun.which('bun'), Bun.which('node')];

  if (runtimesPaths.includes(currentPath)) {
    return yield* Effect.fail(
      new UpgradeBinaryError({
        cause: 'Currently using Composio CLI via Bun or Node.js runtime',
        message:
          'Cannot upgrade runtime binary. Please run the upgrade command from a self-contained Composio CLI binary.',
      })
    );
  }

  return currentPath;
});

const tempSiblingPath = (path: Path.Path, targetPath: string) =>
  path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.tmp-${Math.random().toString(36).slice(2)}`
  );

const syncFile = (fs: FileSystem.FileSystem, filePath: string) =>
  Effect.scoped(Effect.flatMap(fs.open(filePath, { flag: 'r+' }), file => file.sync));

/**
 * The temp copy lands in the target's own directory so the final rename stays
 * on one filesystem (atomic): the destination is either fully old or fully new.
 */
const atomicReplaceFile = (
  ctx: UpgradeBinaryContext,
  sourcePath: string,
  targetPath: string,
  errorMessage: string,
  options: {
    readonly executable?: boolean;
  } = {}
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    const stagedPath = tempSiblingPath(path, targetPath);
    yield* Effect.gen(function* () {
      yield* fs.copyFile(sourcePath, stagedPath);
      if (options.executable) {
        yield* fs.chmod(stagedPath, 0o755);
      }
      const sourceInfo = yield* fs.stat(sourcePath);
      const stagedInfo = yield* fs.stat(stagedPath);
      if (sourceInfo.size !== stagedInfo.size) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            cause: `Size mismatch after copy: expected ${sourceInfo.size}, got ${stagedInfo.size}`,
            message: errorMessage,
          })
        );
      }
      yield* syncFile(fs, stagedPath);
      yield* fs.rename(stagedPath, targetPath);
    }).pipe(
      Effect.mapError(cause => {
        if (cause instanceof UpgradeBinaryError) {
          return cause;
        }
        return new UpgradeBinaryError({ cause, message: errorMessage });
      }),
      Effect.onError(() => fs.remove(stagedPath, { force: true }).pipe(Effect.ignore))
    );
  });

/** Replace a directory through a sibling backup so a failed swap can restore the installed tree. */
export const atomicReplaceDirectory = (
  ctx: UpgradeBinaryContext,
  sourceDir: string,
  targetDir: string,
  errorMessage: string
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    const stagedDir = tempSiblingPath(path, targetDir);
    const backupDir = tempSiblingPath(path, targetDir);
    yield* Effect.gen(function* () {
      yield* fs.copy(sourceDir, stagedDir);
      const targetExists = yield* fs.exists(targetDir);
      if (targetExists) {
        yield* fs.rename(targetDir, backupDir);
      }
      yield* fs.rename(stagedDir, targetDir).pipe(
        Effect.catchAll(swapCause => {
          if (!targetExists) {
            return Effect.fail(swapCause);
          }
          return fs.rename(backupDir, targetDir).pipe(
            Effect.matchEffect({
              onFailure: rollbackCause =>
                Effect.fail(
                  new DirectoryRollbackError({
                    backupDir,
                    rollbackCause,
                    swapCause,
                  })
                ),
              onSuccess: () => Effect.fail(swapCause),
            })
          );
        })
      );
      yield* fs.remove(backupDir, { recursive: true, force: true });
    }).pipe(
      Effect.mapError(cause => new UpgradeBinaryError({ cause, message: errorMessage })),
      Effect.onError(() =>
        fs.remove(stagedDir, { recursive: true, force: true }).pipe(Effect.ignore)
      )
    );
  });

/**
 * Ordered to minimize torn state: companions and local-tool assets first, the
 * executable next, release-tag.txt last. Rename-over (never in-place
 * overwrite) also sidesteps macOS's signature-cache kill for signed binaries.
 */
export const replaceBinary = (
  ctx: UpgradeBinaryContext,
  sourcePath: string,
  targetPath: string,
  options: {
    releaseTag?: string;
  } = {}
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    yield* Effect.logDebug(`Replacing binary: ${sourcePath} -> ${targetPath}`);

    const sourceDirectory = path.dirname(sourcePath);
    const targetDirectory = path.dirname(targetPath);
    const companionRelativePaths = yield* provideFsAndPath(
      ctx,
      collectExpectedRunCompanionAssetRelativePaths(sourceDirectory)
    );
    for (const relativePath of companionRelativePaths) {
      const sourceCompanion = path.join(sourceDirectory, relativePath);
      const sourceExists = yield* fs
        .exists(sourceCompanion)
        .pipe(Effect.catchAll(() => Effect.succeed(false)));

      if (!sourceExists) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            cause: `Missing companion module: ${sourceCompanion}`,
            message: 'Downloaded binary package is incomplete',
          })
        );
      }
    }

    for (const relativePath of companionRelativePaths) {
      const targetCompanion = path.join(targetDirectory, relativePath);
      yield* fs.makeDirectory(path.dirname(targetCompanion), { recursive: true }).pipe(
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({
              cause,
              message: `Failed to create companion module directory: ${relativePath}`,
            })
        )
      );

      yield* atomicReplaceFile(
        ctx,
        path.join(sourceDirectory, relativePath),
        targetCompanion,
        `Failed to replace companion module: ${relativePath}`
      );
    }

    const localToolsAssetSource = path.join(sourceDirectory, LOCAL_TOOLS_BINARY_ASSET_DIRNAME);
    const localToolsAssetExists = yield* fs
      .exists(localToolsAssetSource)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (localToolsAssetExists) {
      yield* atomicReplaceDirectory(
        ctx,
        localToolsAssetSource,
        path.join(targetDirectory, LOCAL_TOOLS_BINARY_ASSET_DIRNAME),
        'Failed to replace local-tool binary assets'
      );
    }

    yield* atomicReplaceFile(ctx, sourcePath, targetPath, 'Failed to replace binary', {
      executable: true,
    });

    const releaseTag = options.releaseTag;
    if (releaseTag) {
      yield* provideFsAndPath(ctx, writeInstalledReleaseTag(targetDirectory, releaseTag)).pipe(
        Effect.mapError(
          error =>
            new UpgradeBinaryError({
              cause: error,
              message: 'Failed to update installed release metadata',
            })
        )
      );
    }
  });

/**
 * Main upgrade function
 */
const upgrade = (
  ctx: UpgradeBinaryContext,
  options: {
    prerelease?: boolean;
    tag?: string;
  } = {}
) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const upgradeTargetOpt = yield* DEBUG_OVERRIDE_CONFIG['UPGRADE_TARGET'];
    const currentPath = yield* getCurrentExecutablePath();
    const prerelease = options.prerelease ?? false;
    const explicitTag = options.tag;
    const currentReleaseIdentifier = yield* resolveCurrentReleaseIdentifier(ctx, currentPath);
    yield* Effect.logDebug(`Current executable path: ${currentPath}`);
    yield* Effect.logDebug(`Current release identifier: ${currentReleaseIdentifier}`);

    yield* ui.intro('composio upgrade');

    // If local binary path is provided (for testing), use it directly
    if (Option.isSome(upgradeTargetOpt)) {
      yield* ui.log.info(`New local version available (current: ${currentReleaseIdentifier})`);
      yield* replaceBinary(ctx, upgradeTargetOpt.value, currentPath);
      yield* ui.outro('Upgrade completed');
      return undefined;
    }

    const didUpgrade = yield* ui.useMakeSpinner('Checking for updates...', spinner =>
      Effect.gen(function* () {
        const platformArch = yield* detectPlatform;
        const release = yield* fetchLatestRelease(ctx, platformArch, {
          prerelease,
          tag: explicitTag,
        });
        if (!explicitTag) {
          const updateAvailable = yield* isUpdateAvailable(release, currentReleaseIdentifier);
          if (!updateAvailable) {
            yield* spinner.stop('You are already running the latest version!');
            return false;
          }
        } else if (release.tag_name === currentReleaseIdentifier) {
          yield* Effect.logDebug(`Already running ${release.tag_name}; re-installing as requested`);
        }

        yield* spinner.message(
          explicitTag
            ? `Installing ${release.tag_name} (current: ${currentReleaseIdentifier})...`
            : `New version available: ${release.tag_name} (current: ${currentReleaseIdentifier}). Downloading...`
        );

        const { name, data } = yield* downloadBinary(ctx, release, platformArch);

        yield* spinner.message('Verifying checksum...');

        const checksums = yield* fetchChecksums(ctx, release);
        if (Option.isSome(checksums)) {
          const expectedHash = checksums.value.get(name);
          if (expectedHash) {
            yield* verifyChecksum(data, expectedHash, name);
          } else {
            yield* Effect.logDebug(`No checksum entry found for ${name} — skipping verification`);
          }
        }

        yield* spinner.message('Extracting...');

        // The temporary directory is automatically cleaned up
        const tmpDir = yield* ctx.fs
          .makeTempDirectoryScoped({ prefix: `${CLI_BINARY_NAME}-upgrade` })
          .pipe(
            Effect.mapError(
              cause =>
                new UpgradeBinaryError({
                  cause,
                  message: 'Failed to create temporary directory',
                })
            )
          );

        const extractedBinary = yield* extractBinary(ctx, { name, data }, tmpDir);
        yield* replaceBinary(ctx, extractedBinary.binaryPath, currentPath, {
          releaseTag: release.tag_name,
        });

        yield* spinner.stop('Upgrade completed!');
        return release.tag_name;
      })
    );

    yield* ui.outro(
      didUpgrade ? 'Restart your terminal to use the new version.' : 'No upgrade needed.'
    );

    return didUpgrade || undefined; // release tag string, or undefined if no upgrade
  });

// Service to manage CLI binary upgrades
export class UpgradeBinary extends Effect.Service<UpgradeBinary>()('services/UpgradeBinary', {
  accessors: true,
  effect: Effect.gen(function* () {
    const ctx: UpgradeBinaryContext = {
      httpClient: yield* HttpClient.HttpClient,
      fs: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      githubConfig: yield* GITHUB_CONFIG_ALL,
    };

    return {
      upgrade: (options: { prerelease?: boolean; tag?: string } = {}) => upgrade(ctx, options),
    } as const;
  }),
  dependencies: [Path.layer],
}) {}
