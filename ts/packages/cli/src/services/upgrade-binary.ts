import {
  Data,
  Effect,
  Config,
  Match,
  Option,
  Predicate,
  Record as EffectRecord,
  Scope,
  Stream,
} from 'effect';
import { HttpClient, HttpClientResponse, FileSystem, Path } from '@effect/platform';
import { APP_VERSION } from '../constants';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { detectPlatform, type PlatformArch } from 'src/effects/detect-platform';
import { CompareSemverError, semverComparator } from 'src/effects/compare-semver';
import { fetchLatestCliRelease, GitHubRelease } from 'src/effects/resolve-cli-release';
import { parseChecksumsText, sha256Hex } from 'src/utils/checksums';
import {
  atomicReplaceDirectory,
  atomicReplaceFile,
  type AtomicReplaceError,
} from 'src/utils/atomic-replace';

// Note: `node:zlib` does not support Github's zip files
import { extractZipSafely } from 'src/utils/extract-zip-safely';
import { renderPrettyError } from './utils/pretty-error';
import { TerminalUI } from './terminal-ui';
import {
  collectExpectedRunCompanionAssetRelativePaths,
  RUN_COMPANION_RELEASE_TAG_FILENAME,
  resolveRunningCliReleaseTag,
  writeInstalledReleaseTag,
} from './run-companion-modules';

export class UpgradeBinaryError extends Data.TaggedError('services/UpgradeBinaryError')<{
  readonly cause?: unknown;
  readonly message?: string;
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
interface UpgradeBinaryContext {
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

const provideFsAndPath = <A, E, R>(
  { fs, path }: Pick<UpgradeBinaryContext, 'fs' | 'path'>,
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | R>
) =>
  effect.pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path)
  );

/**
 * Check if update is available
 */
const resolveCurrentReleaseIdentifier = (ctx: UpgradeBinaryContext, currentPath: string) =>
  provideFsAndPath(ctx, resolveRunningCliReleaseTag(currentPath, APP_VERSION));

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

type DownloadProgress = {
  readonly receivedBytes: number;
  readonly totalBytes: number | undefined;
};

type DownloadProgressReporter = (progress: DownloadProgress) => Effect.Effect<void>;

// Fast enough to look live, slow enough not to thrash the spinner.
const DOWNLOAD_PROGRESS_INTERVAL_MILLIS = 250;

const MEGABYTE = 1_000_000;

export const formatMegabytes = (bytes: number): string => `${(bytes / MEGABYTE).toFixed(1)} MB`;

/**
 * Human-readable transfer state. Falls back to a plain byte count when the
 * server never told us how large the asset is.
 */
export const formatDownloadProgress = ({ receivedBytes, totalBytes }: DownloadProgress): string => {
  if (totalBytes === undefined || totalBytes <= 0) {
    return `Downloading... ${formatMegabytes(receivedBytes)}`;
  }

  const percent = Math.min(100, Math.floor((receivedBytes / totalBytes) * 100));
  return `Downloading... ${percent}% (${formatMegabytes(receivedBytes)} / ${formatMegabytes(totalBytes)})`;
};

const resolveDownloadTotalBytes = (
  asset: { readonly size?: number },
  response: HttpClientResponse.HttpClientResponse
): number | undefined => {
  if (typeof asset.size === 'number' && asset.size > 0) {
    return asset.size;
  }

  const header = response.headers['content-length'];
  const parsed = header === undefined ? Number.NaN : Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Download binary for current platform
 */
const downloadBinary = (
  { httpClient }: UpgradeBinaryContext,
  release: GitHubRelease,
  platformArch: PlatformArch,
  onProgress: DownloadProgressReporter = () => Effect.void
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

    // Streamed rather than buffered so the transfer can be reported as it runs:
    // these archives are hundreds of megabytes, and a silent multi-minute wait
    // is indistinguishable from a hung command.
    const totalBytes = resolveDownloadTotalBytes(asset, response);

    const parts: Array<Uint8Array> = [];
    let receivedBytes = 0;
    let lastReportedAt = 0;

    yield* response.stream.pipe(
      Stream.runForEach(chunk => {
        parts.push(chunk);
        receivedBytes += chunk.length;

        const now = Date.now();
        if (now - lastReportedAt < DOWNLOAD_PROGRESS_INTERVAL_MILLIS) {
          return Effect.void;
        }
        lastReportedAt = now;
        return onProgress({ receivedBytes, totalBytes });
      }),
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to read downloaded binary',
          })
      )
    );

    yield* onProgress({ receivedBytes, totalBytes: totalBytes ?? receivedBytes });

    const data = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const part of parts) {
      data.set(part, offset);
      offset += part.length;
    }

    return {
      name: binaryName,
      data,
    };
  });

/**
 * Fetch checksums.txt from a release, if available.
 * Returns the parsed map of filename -> expected SHA-256 hash, or None if not found.
 */
const fetchChecksums = (
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
const verifyChecksum = (
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
const extractBinary = (
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
        await extractZipSafely(zipPath, extractDir);
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
const getCurrentExecutablePath = Effect.fn(function* () {
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

/**
 * Replace current executable binary with the new target one.
 */
const mapAtomicReplaceError = (message: string) => (error: AtomicReplaceError) =>
  new UpgradeBinaryError({
    cause: error.cause,
    message: `${message}: ${error.message}`,
  });

const replaceBinary = (
  ctx: Pick<UpgradeBinaryContext, 'fs' | 'path'>,
  sourcePath: string,
  targetPath: string,
  options: {
    releaseTag?: string;
  } = {}
): Effect.Effect<void, UpgradeBinaryError, Scope.Scope> =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    yield* Effect.logDebug(`Replacing binary: ${sourcePath} -> ${targetPath}`);

    const sourceDirectory = path.dirname(sourcePath);
    const targetDirectory = path.dirname(targetPath);
    const companionRelativePaths = yield* provideFsAndPath(
      ctx,
      collectExpectedRunCompanionAssetRelativePaths(sourceDirectory)
    );
    const companionReplacements: Array<{
      readonly relativePath: string;
      readonly sourcePath: string;
      readonly targetPath: string;
    }> = [];

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

      companionReplacements.push({
        relativePath,
        sourcePath: sourceCompanion,
        targetPath: path.join(targetDirectory, relativePath),
      });
    }

    const localToolsAssetSource = path.join(sourceDirectory, LOCAL_TOOLS_BINARY_ASSET_DIRNAME);
    const localToolsAssetExists = yield* fs
      .exists(localToolsAssetSource)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));
    const localToolsAssetTarget = path.join(targetDirectory, LOCAL_TOOLS_BINARY_ASSET_DIRNAME);

    const releaseTag = options.releaseTag;
    const stagedReleaseTagPath = path.join(sourceDirectory, RUN_COMPANION_RELEASE_TAG_FILENAME);
    if (releaseTag) {
      yield* provideFsAndPath(ctx, writeInstalledReleaseTag(sourceDirectory, releaseTag)).pipe(
        Effect.mapError(
          error =>
            new UpgradeBinaryError({
              cause: error,
              message: 'Failed to update installed release metadata',
            })
        )
      );
    }

    for (const replacement of companionReplacements) {
      const {
        relativePath,
        sourcePath: sourceCompanion,
        targetPath: targetCompanion,
      } = replacement;
      yield* fs.makeDirectory(path.dirname(targetCompanion), { recursive: true }).pipe(
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({
              cause,
              message: `Failed to create companion module directory: ${relativePath}`,
            })
        )
      );

      yield* provideFsAndPath(
        ctx,
        atomicReplaceFile({ sourcePath: sourceCompanion, targetPath: targetCompanion })
      ).pipe(
        Effect.mapError(
          mapAtomicReplaceError(`Failed to replace companion module: ${relativePath}`)
        )
      );
    }

    if (localToolsAssetExists) {
      yield* provideFsAndPath(
        ctx,
        atomicReplaceDirectory({
          sourcePath: localToolsAssetSource,
          targetPath: localToolsAssetTarget,
        })
      ).pipe(Effect.mapError(mapAtomicReplaceError('Failed to replace local-tool binary assets')));
    }

    if (releaseTag) {
      yield* provideFsAndPath(
        ctx,
        atomicReplaceFile({
          sourcePath: stagedReleaseTagPath,
          targetPath: path.join(targetDirectory, RUN_COMPANION_RELEASE_TAG_FILENAME),
        })
      ).pipe(Effect.mapError(mapAtomicReplaceError('Failed to update installed release metadata')));
    }

    yield* provideFsAndPath(ctx, atomicReplaceFile({ sourcePath, targetPath, mode: 0o755 })).pipe(
      Effect.mapError(mapAtomicReplaceError('Failed to replace binary'))
    );
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
      yield* replaceBinary(ctx, upgradeTargetOpt.value, currentPath, {
        releaseTag: explicitTag,
      });
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

        const { name, data } = yield* downloadBinary(ctx, release, platformArch, progress =>
          spinner.message(formatDownloadProgress(progress))
        );

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
