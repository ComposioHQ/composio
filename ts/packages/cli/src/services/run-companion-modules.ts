// Release-archive companion paths, the release manifest, and the installed release tag,
// shared by the CLI runtime, `composio upgrade`, and the binary build scripts. Every
// helper is an Effect over the @effect/platform FileSystem/Path services; scripts
// provide their own platform layers.
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Data, Effect, Option, PlatformError, Schema } from 'effect';
import semver from 'semver';
import { IS_RELEASE_BUILD } from 'src/constants';
import { CLI_RELEASE_TAG_PREFIX } from 'src/utils/cli-release-version';

// Paths kept in release archives (`<name>.mjs` and `services/<name>.mjs`) as
// few-byte stubs: released clients check an upgrade archive for them, and a
// manifest needs at least one companion. The executable carries the code and
// loads nothing from disk.
export const RUN_COMPANION_MODULE_BASENAMES: ReadonlyArray<string> = [
  'run-helpers-runtime',
  'generation-runtime',
];

export const RUN_COMPANION_MODULE_FILENAMES = RUN_COMPANION_MODULE_BASENAMES.map(
  name => `${name}.mjs`
);

export const RUN_COMPANION_RELEASE_TAG_FILENAME = 'release-tag.txt';

export const RELEASE_MANIFEST_FILENAME = 'release-manifest.json';

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1;

// Paths the removed `experimental_subAgent` helper used to ship. Release archives
// keep them as zero-byte files because every stable CLI from 0.2.12 to 0.4.2
// verifies a downloaded upgrade package against its own copy of this list, by
// existence only, and refuses a package that lacks any of them.
//
// Frozen: nothing derives it from live code, so it must not change while those
// clients can still upgrade. It stays out of `RUN_COMPANION_MODULE_BASENAMES`,
// which drives the bundler; packaging is the only writer, so installs and source
// checkouts never require these files.
// `.github/scripts/cli-release/verify-archive-companions.sh` carries the same list.
export const RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS: ReadonlyArray<string> = [
  'run-subagent-shared.mjs',
  'run-subagent-acp.mjs',
  'run-subagent-legacy.mjs',
  'run-subagent-output-mcp.mjs',
  'acp-adapters/claude-code-acp.mjs',
  'acp-adapters/cli.js',
  'acp-adapters/codex/darwin-arm64/codex-acp',
  'acp-adapters/codex/darwin-x64/codex-acp',
  'acp-adapters/codex/linux-arm64/codex-acp',
  'acp-adapters/codex/linux-x64/codex-acp',
];

const isArchiveRelativePath = (value: string): boolean =>
  !value.startsWith('/') &&
  !value.includes('\\') &&
  !/^[A-Za-z]:/.test(value) &&
  value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');

const ArchiveRelativePath = Schema.String.check(
  Schema.makeFilter(isArchiveRelativePath, {
    expected: 'a relative POSIX path with no empty, "." or ".." segments',
  })
);

const isSortedAndUnique = (values: ReadonlyArray<string>): boolean =>
  values.every((value, index) => index === 0 || values[index - 1]! < value);

/**
 * What a release archive says it contains, written by packaging as
 * `release-manifest.json` next to the executable. A client that reads it checks
 * the download against `companions` instead of the companion names compiled
 * into itself, so a later archive can drop a file without breaking upgrades.
 *
 * Adding a field keeps schema version 1, since decoding ignores unknown keys. A
 * change an older reader would misread bumps the version, and a client refuses a
 * version it does not know.
 */
export const ReleaseManifest = Schema.Struct({
  schemaVersion: Schema.Literal(RELEASE_MANIFEST_SCHEMA_VERSION),
  /** The earliest CLI version that may upgrade to this archive. */
  minimumUpgradeFrom: Schema.String.check(
    Schema.makeFilter(value => semver.valid(value) === value, { expected: 'a semver version' })
  ),
  companions: Schema.NonEmptyArray(ArchiveRelativePath).check(
    Schema.makeFilter(isSortedAndUnique, { expected: 'sorted, unique paths' })
  ),
});
export type ReleaseManifest = typeof ReleaseManifest.Type;

const ReleaseManifestVersion = Schema.fromJsonString(
  Schema.Struct({ schemaVersion: Schema.Unknown })
);
const ReleaseManifestFromJson = Schema.fromJsonString(ReleaseManifest);

export class ReleaseManifestError extends Data.TaggedError('services/ReleaseManifestError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type ArchiveCompanions = Data.TaggedEnum<{
  Manifest: { readonly manifest: ReleaseManifest; readonly relativePaths: ReadonlyArray<string> };
  CompiledNames: { readonly relativePaths: ReadonlyArray<string> };
}>;
export const ArchiveCompanions = Data.taggedEnum<ArchiveCompanions>();

const manifestError = (message: string) => (cause: unknown) =>
  new ReleaseManifestError({ message, cause });

const decodeReleaseManifest = (
  text: string
): Effect.Effect<ReleaseManifest, ReleaseManifestError> =>
  Effect.gen(function* () {
    const { schemaVersion } = yield* Schema.decodeUnknownEffect(ReleaseManifestVersion)(text).pipe(
      Effect.mapError(manifestError(`${RELEASE_MANIFEST_FILENAME} is not valid JSON`))
    );
    if (schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) {
      return yield* new ReleaseManifestError({
        message: `${RELEASE_MANIFEST_FILENAME} has schema version ${String(schemaVersion)}, which this CLI cannot read`,
      });
    }
    return yield* Schema.decodeUnknownEffect(ReleaseManifestFromJson)(text).pipe(
      Effect.mapError(manifestError(`${RELEASE_MANIFEST_FILENAME} is invalid`))
    );
  });

/**
 * Resolves what the release package extracted at `packageDir` provides. A
 * manifest that is present but unreadable or invalid fails: the archive is
 * broken, and guessing from compiled names could install a partial release.
 */
export const resolveArchiveCompanions = (
  packageDir: string
): Effect.Effect<ArchiveCompanions, ReleaseManifestError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestText = yield* fs
      .readFileString(path.join(packageDir, RELEASE_MANIFEST_FILENAME), 'utf8')
      .pipe(
        Effect.map(Option.some),
        Effect.catchReason('PlatformError', 'NotFound', () => Effect.succeed(Option.none())),
        Effect.mapError(manifestError(`Cannot read ${RELEASE_MANIFEST_FILENAME}`))
      );
    if (Option.isNone(manifestText)) {
      return ArchiveCompanions.CompiledNames({
        relativePaths: yield* collectExpectedRunCompanionAssetRelativePaths(packageDir),
      });
    }
    const manifest = yield* decodeReleaseManifest(manifestText.value);
    return ArchiveCompanions.Manifest({ manifest, relativePaths: manifest.companions });
  });

const relativeImportPattern =
  /(?:import\s+(?:[^'"]+?\s+from\s+)?|export\s+(?:\*\s+from\s+|\{[^}]+\}\s+from\s+)|import\s*\()\s*["'](\.{1,2}\/[^"']+?\.mjs)["']/g;

const isImportGraphFile = (relativePath: string) => /\.(?:m?js|ts)$/.test(relativePath);

const fileExists = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.exists(filePath).pipe(Effect.orElseSucceed(() => false));

export const isBunVirtualPath = (filePath: string): boolean =>
  /^(?:\/?[A-Za-z]:)?[/\\]\$bunfs[/\\]/.test(filePath) ||
  /^\/?[A-Za-z]:[/\\]~BUN[/\\]/.test(filePath);

const collectRelativeImportPaths = ({
  fs,
  path,
  rootDir,
  relativePath,
  collected,
  recordMissingPaths = false,
}: {
  fs: FileSystem.FileSystem;
  path: Path.Path;
  rootDir: string;
  relativePath: string;
  collected: Set<string>;
  recordMissingPaths?: boolean;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const normalizedRelativePath = relativePath.replaceAll(path.sep, '/');
    if (collected.has(normalizedRelativePath)) {
      return;
    }

    const absolutePath = path.join(rootDir, normalizedRelativePath);
    const exists = yield* fileExists(fs, absolutePath);
    if (!exists && !recordMissingPaths) {
      return;
    }

    collected.add(normalizedRelativePath);
    if (!exists) {
      return;
    }

    if (!isImportGraphFile(normalizedRelativePath)) {
      return;
    }

    const source = yield* Effect.orDie(fs.readFileString(absolutePath, 'utf8'));
    for (const match of source.matchAll(relativeImportPattern)) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }

      const dependencyRelativePath = path
        .relative(rootDir, path.resolve(path.dirname(absolutePath), specifier))
        .replaceAll(path.sep, '/');

      yield* collectRelativeImportPaths({
        fs,
        path,
        rootDir,
        relativePath: dependencyRelativePath,
        collected,
        recordMissingPaths,
      });
    }
  });

/**
 * Relative paths an install rooted at `rootDir` is expected to contain: the
 * companion wrappers and every relative import reachable from them.
 */
export const collectExpectedRunCompanionAssetRelativePaths = (
  rootDir: string
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const collected = new Set<string>();

    for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
      yield* collectRelativeImportPaths({
        fs,
        path,
        rootDir,
        relativePath: fileName,
        collected,
        recordMissingPaths: true,
      });
    }

    return [...collected].sort();
  });

export const resolveBinaryAssetName = ({
  platform = process.platform,
  arch = process.arch,
}: {
  platform?: NodeJS.Platform;
  arch?: string;
}) => {
  switch (`${platform}-${arch}`) {
    case 'darwin-arm64':
      return 'composio-darwin-aarch64.zip';
    case 'darwin-x64':
      return 'composio-darwin-x64.zip';
    case 'linux-x64':
      return 'composio-linux-x64.zip';
    case 'linux-arm64':
      return 'composio-linux-aarch64.zip';
    case 'win32-x64':
      return 'composio-windows-x64.zip';
    default:
      return undefined;
  }
};

const readTextFileIfPresent = (fs: FileSystem.FileSystem, filePath: string) =>
  Effect.gen(function* () {
    const exists = yield* fileExists(fs, filePath);
    if (!exists) {
      return undefined;
    }

    const value = (yield* Effect.orDie(fs.readFileString(filePath, 'utf8'))).trim();
    return value.length > 0 ? value : undefined;
  });

export const readInstalledReleaseTag = (
  execPath: string
): Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* readTextFileIfPresent(
      fs,
      path.join(path.dirname(execPath), RUN_COMPANION_RELEASE_TAG_FILENAME)
    );
  });

export const normalizeCliReleaseVersion = (releaseIdentifier: string): string => {
  const trimmed = releaseIdentifier.trim();
  if (trimmed.startsWith(CLI_RELEASE_TAG_PREFIX)) {
    return trimmed.slice(CLI_RELEASE_TAG_PREFIX.length);
  }
  if (/^v\d+\.\d+\.\d+(?:[-+].*)?$/.test(trimmed)) {
    return trimmed.slice(1);
  }
  return trimmed;
};

export const normalizeCliReleaseTag = (releaseIdentifier: string): string =>
  `${CLI_RELEASE_TAG_PREFIX}${normalizeCliReleaseVersion(releaseIdentifier)}`;

export const resolveInstalledCliVersion = (
  execPath: string,
  fallbackVersion: string
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(readInstalledReleaseTag(execPath), releaseTag =>
    normalizeCliReleaseVersion(releaseTag ?? fallbackVersion)
  );

export const resolveInstalledCliReleaseTag = (
  execPath: string,
  fallbackVersion: string
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(readInstalledReleaseTag(execPath), releaseTag =>
    normalizeCliReleaseTag(releaseTag ?? fallbackVersion)
  );

export const resolveRunningCliVersion = (
  execPath: string,
  appVersion: string,
  isReleaseBuild = IS_RELEASE_BUILD
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  isReleaseBuild
    ? Effect.succeed(normalizeCliReleaseVersion(appVersion))
    : resolveInstalledCliVersion(execPath, appVersion);

export const resolveRecordedRunningCliVersion = (
  execPath: string,
  appVersion: string,
  isReleaseBuild = IS_RELEASE_BUILD
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  isReleaseBuild
    ? Effect.succeed(Option.some(normalizeCliReleaseVersion(appVersion)))
    : Effect.map(readInstalledReleaseTag(execPath), releaseTag =>
        Option.map(Option.fromNullishOr(releaseTag), normalizeCliReleaseVersion)
      );

export const resolveRunningCliReleaseTag = (
  execPath: string,
  appVersion: string,
  isReleaseBuild = IS_RELEASE_BUILD
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(
    resolveRunningCliVersion(execPath, appVersion, isReleaseBuild),
    normalizeCliReleaseTag
  );

export const writeInstalledReleaseTag = (
  installDir: string,
  releaseTag: string
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(
      path.join(installDir, RUN_COMPANION_RELEASE_TAG_FILENAME),
      `${releaseTag}\n`
    );
  });
