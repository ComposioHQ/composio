import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { Config, Data, Effect, Layer, Option, Predicate, Schema } from 'effect';
import semver from 'semver';
import { bold, cyanBright, dim } from 'src/ui/colors';
import { APP_VERSION, GITHUB_REPO } from '../constants';
import { NodeOs } from './node-os';
import { resolveRunningCliVersion } from './run-companion-modules';
import { TerminalUI } from './terminal-ui';

/**
 * Background update check for @composio/cli.
 *
 * Two entry points, both called from cli-main BEFORE the root command's
 * Effect runtime boots — they must never block or throw:
 *
 *   showUpdateNotice                — reads a tiny cached JSON file (~1 ms)
 *   checkForUpdateInBackground()    — fire-and-forget fetch, no await
 *
 * Strategy:
 *   Uses GitHub's releases API and only considers stable @composio/cli releases
 *   that include the binary asset for the current platform. The result is cached
 *   to ~/.composio/update-check.json and refreshed at most once every 24 hours.
 */

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Matches `@composio/cli@<semver>` — excludes prereleases. */
const CLI_RELEASE_TAG_RE = /^@composio\/cli@(\d+\.\d+\.\d+)$/;

export interface UpdateCheckState {
  lastChecked: string; // ISO-8601
  latestVersion: string; // e.g. "0.3.0"
}

/** Machine-readable update status for `composio version --check`. */
export interface UpdateStatus {
  /** Version reported by the running CLI executable. */
  current: string;
  /** Latest known stable release with a binary for this platform, if known. */
  latestStable: string | null;
  /** True when a strictly newer stable release than `current` is available. */
  updateAvailable: boolean;
  /** Whether the latest known state is current, actionable, or unavailable. */
  checkStatus: 'up-to-date' | 'update-available' | 'unknown';
  /** When the release list was last fetched (ISO-8601), if ever. */
  lastChecked: string | null;
}

const UpdateCheckStateSchema = Schema.parseJson(
  Schema.Struct({
    lastChecked: Schema.String,
    latestVersion: Schema.String,
  })
);

const UpdateCheckAttemptSchema = Schema.parseJson(
  Schema.Struct({
    lastAttempted: Schema.String,
  })
);

/** Non-2xx GitHub response; recorded as a failed attempt and otherwise swallowed. */
class UpdateCheckHttpError extends Data.TaggedError('UpdateCheckHttpError')<{
  readonly status: number;
}> {}

// ── Injectable configuration ────────────────────────────────────────────

/** Dependencies injected into the update checker — mirrors the Effect service pattern. */
export interface UpdateCheckConfig {
  readonly stateFile: string;
  readonly currentVersion: string;
  readonly checkIntervalMs: number;
  readonly releasesUrl: string;
  readonly binaryAssetName: string | undefined;
  readonly accessToken: string | undefined;
  readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
}

const defaultStateFile = Effect.gen(function* () {
  const path = yield* Path.Path;
  const os = yield* NodeOs;
  return path.join(os.homedir, '.composio', 'update-check.json');
});

function getCurrentBinaryAssetName(os: Pick<NodeOs, 'platform' | 'arch'>): string | undefined {
  const { platform } = os;
  const rawArch: string = os.arch;
  if (platform !== 'darwin' && platform !== 'linux') return undefined;

  const arch = rawArch === 'arm64' || rawArch === 'aarch64' ? 'aarch64' : rawArch;
  if (arch !== 'x64' && arch !== 'aarch64') return undefined;

  return `composio-${platform}-${arch}.zip`;
}

const defaultConfig = (stateFile: string) =>
  Effect.gen(function* () {
    const os = yield* NodeOs;
    const currentVersion = yield* resolveRunningCliVersion(process.execPath, APP_VERSION);
    const accessToken = yield* Effect.orDie(
      Config.option(Config.string('COMPOSIO_GITHUB_ACCESS_TOKEN')).pipe(
        Config.map(Option.getOrUndefined)
      )
    );
    return {
      stateFile,
      currentVersion,
      checkIntervalMs: CHECK_INTERVAL_MS,
      releasesUrl: `${GITHUB_REPO.API_BASE_URL}/repos/${GITHUB_REPO.OWNER}/${GITHUB_REPO.REPO}/releases?per_page=100`,
      binaryAssetName: getCurrentBinaryAssetName(os),
      accessToken,
      fetchFn: fetch,
    } satisfies UpdateCheckConfig;
  });

// ── Pure helpers ────────────────────────────────────────────────────────

/** Extract the highest stable semver from GitHub releases that include the required binary. */
export function parseLatestVersionFromReleases(
  releases: unknown,
  binaryAssetName: string | undefined
): string | undefined {
  if (!binaryAssetName || !Array.isArray(releases)) return undefined;

  let latest: string | undefined;
  for (const release of releases) {
    if (!Predicate.isRecord(release)) continue;

    const candidate = release;
    if (typeof candidate.tag_name !== 'string') continue;
    if (candidate.prerelease === true || candidate.draft === true) continue;
    if (!Array.isArray(candidate.assets)) continue;

    const hasRequiredBinary = candidate.assets.some(
      asset => Predicate.hasProperty(asset, 'name') && asset.name === binaryAssetName
    );
    if (!hasRequiredBinary) continue;

    const match = CLI_RELEASE_TAG_RE.exec(candidate.tag_name);
    if (!match) continue;

    const version = match[1];
    if (!latest || semver.gt(version, latest)) {
      latest = version;
    }
  }

  return latest;
}

// ── Factory ─────────────────────────────────────────────────────────────

export function createUpdateChecker(config: UpdateCheckConfig) {
  const attemptFile = `${config.stateFile}.attempt`;

  const readState = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const rawState = yield* fs.readFileString(config.stateFile);
    return yield* Schema.decodeUnknown(UpdateCheckStateSchema)(rawState);
  });

  const readAttempt = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const rawAttempt = yield* fs.readFileString(attemptFile);
    return yield* Schema.decodeUnknown(UpdateCheckAttemptSchema)(rawAttempt);
  });

  /**
   * If a cached newer version is known, print a one-line hint to stderr.
   * Reads a tiny JSON file and does a semver compare.
   */
  function showUpdateNotice(terminal: Pick<TerminalUI, 'capabilities' | 'error'>) {
    return Effect.gen(function* () {
      // `terminal.error` writes even when stderr is redirected, so gate this
      // advisory notice explicitly while leaving stdout out of the decision.
      const { canDecorate } = yield* terminal.capabilities;
      if (!canDecorate) return;

      const state = yield* readState;
      const latestVersion = semver.valid(state.latestVersion);
      const currentVersion = semver.valid(config.currentVersion);
      if (!latestVersion || !currentVersion || latestVersion === currentVersion) return;

      // Only show when the cached version is strictly newer.
      if (!semver.gt(latestVersion, currentVersion)) return;

      const msg =
        `  ${dim('Update available:')} ${dim(config.currentVersion)} ${dim('→')} ${bold(cyanBright(latestVersion))}\n` +
        `  ${dim('Run')} ${cyanBright('composio upgrade')} ${dim('to update')}\n`;

      yield* terminal.error(`\n${msg}`);
    }).pipe(Effect.ignore);
  }

  /**
   * Fetch the latest @composio/cli release from GitHub, requiring the current
   * platform binary asset before writing the result to the state file.
   *
   * Never fails: every fetch/parse/write error is swallowed so nothing can
   * propagate back into the fire-and-forget caller.
   */
  const checkForUpdate = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const checkStartedAt = new Date();
    const checkStartedAtMs = checkStartedAt.getTime();
    const parseTimestamp = (value: string): number | undefined => {
      const timestamp = new Date(value).getTime();
      return Number.isFinite(timestamp) ? timestamp : undefined;
    };

    // Throttle: skip if checked recently. A missing or corrupt state file
    // just means "re-check".
    const cachedState = yield* Effect.option(readState);
    const lastCheckedAt = Option.getOrUndefined(
      Option.map(cachedState, state => parseTimestamp(state.lastChecked))
    );
    if (lastCheckedAt !== undefined && checkStartedAtMs - lastCheckedAt < config.checkIntervalMs) {
      return { state: cachedState, refreshFailed: false } as const;
    }
    const failedAttempt = yield* Effect.option(readAttempt);
    const lastAttemptedAt = Option.getOrUndefined(
      Option.map(failedAttempt, attempt => parseTimestamp(attempt.lastAttempted))
    );
    if (
      lastAttemptedAt !== undefined &&
      (lastCheckedAt === undefined || lastAttemptedAt > lastCheckedAt) &&
      checkStartedAtMs - lastAttemptedAt < config.checkIntervalMs
    ) {
      return { state: cachedState, refreshFailed: true } as const;
    }
    const previousLatestVersion = Option.getOrUndefined(
      Option.map(cachedState, state => state.latestVersion)
    );

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': `composio-cli/${config.currentVersion}`,
    };

    if (config.accessToken) {
      headers.Authorization = `Bearer ${config.accessToken}`;
    }

    const writeJsonFile = (file: string, value: unknown) =>
      fs
        .makeDirectory(path.dirname(file), { recursive: true })
        .pipe(Effect.andThen(fs.writeFileString(file, JSON.stringify(value, null, 2))));

    const fetchLatestVersion = Effect.gen(function* () {
      const response = yield* Effect.tryPromise(() =>
        config.fetchFn(config.releasesUrl, { headers, signal: AbortSignal.timeout(10_000) })
      );
      if (!response.ok) {
        return yield* new UpdateCheckHttpError({ status: response.status });
      }
      const releases: unknown = yield* Effect.tryPromise(() => response.json());
      return parseLatestVersionFromReleases(releases, config.binaryAssetName);
    });

    const latestVersion = yield* Effect.option(fetchLatestVersion);
    if (Option.isNone(latestVersion)) {
      yield* Effect.ignore(
        writeJsonFile(attemptFile, {
          lastAttempted: checkStartedAt.toISOString(),
        })
      );
      return { state: cachedState, refreshFailed: true } as const;
    }

    const state: UpdateCheckState = {
      lastChecked: new Date().toISOString(),
      latestVersion: latestVersion.value ?? previousLatestVersion ?? config.currentVersion,
    };
    yield* writeJsonFile(config.stateFile, state).pipe(
      Effect.andThen(fs.remove(attemptFile, { force: true })),
      Effect.ignore
    );
    return { state: Option.some(state), refreshFailed: false } as const;
  });

  /**
   * Refresh the release cache (self-throttled to the check interval) and
   * report a machine-readable status. Unlike the notice, this ignores the
   * TTY gate — callers asked for the data explicitly.
   */
  const getUpdateStatus: Effect.Effect<UpdateStatus, never, FileSystem.FileSystem | Path.Path> =
    Effect.gen(function* () {
      const { state, refreshFailed } = yield* checkForUpdate;

      const cachedLatest = Option.getOrUndefined(Option.map(state, s => s.latestVersion));
      const validLatest = cachedLatest ? semver.valid(cachedLatest) : null;
      const validCurrent = semver.valid(config.currentVersion);
      const latestStable =
        validLatest && semver.prerelease(validLatest) === null ? validLatest : null;
      const updateAvailable =
        validCurrent !== null && latestStable !== null && semver.gt(latestStable, validCurrent);
      const checkStatus = updateAvailable
        ? 'update-available'
        : refreshFailed || validCurrent === null || latestStable === null
          ? 'unknown'
          : 'up-to-date';

      return {
        current: config.currentVersion,
        latestStable,
        updateAvailable,
        checkStatus,
        lastChecked: Option.getOrElse(
          Option.map(state, s => s.lastChecked),
          () => null as string | null
        ),
      } satisfies UpdateStatus;
    });

  return { showUpdateNotice, checkForUpdate, getUpdateStatus };
}

// ── Public API (production defaults, fire-and-forget) ───────────────────

const DefaultConfigLayers = Layer.mergeAll(Path.layer, NodeOs.Default, BunFileSystem.layer);

/** Print upgrade hint to stderr if a newer version is cached. */
export const showUpdateNotice = Effect.gen(function* () {
  const terminal = yield* TerminalUI;
  const stateFile = yield* defaultStateFile;
  const config = yield* defaultConfig(stateFile);
  yield* createUpdateChecker(config).showUpdateNotice(terminal);
}).pipe(Effect.provide(DefaultConfigLayers));

/**
 * Refresh the release cache if stale and return a machine-readable status.
 * Powers `composio version --check`.
 */
export const getUpdateStatus: Effect.Effect<UpdateStatus> = Effect.gen(function* () {
  const stateFile = yield* defaultStateFile;
  const config = yield* defaultConfig(stateFile);
  return yield* createUpdateChecker(config).getUpdateStatus;
}).pipe(Effect.provide(DefaultConfigLayers));

/** Fire-and-forget background fetch to GitHub. */
export function checkForUpdateInBackground(): void {
  // Uses a detached runtime so short-lived command handlers do not interrupt the refresh.
  // runPromiseExit never throws into the caller, and checkForUpdate swallows its own failures.
  void Effect.runPromiseExit(
    Effect.gen(function* () {
      const stateFile = yield* defaultStateFile;
      const config = yield* defaultConfig(stateFile);
      yield* createUpdateChecker(config).checkForUpdate;
    }).pipe(Effect.provide(DefaultConfigLayers))
  );
}
