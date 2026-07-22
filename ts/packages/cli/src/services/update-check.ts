import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { Config, Data, Effect, FileSystem, Layer, Option, Path, Predicate, Schema } from 'effect';
import semver from 'semver';
import { bold, cyanBright, dim } from 'src/ui/colors';
import { APP_VERSION, GITHUB_REPO } from '../constants';
import { NodeOs, type NodeOsShape } from './node-os';
import { resolveInstalledCliVersion } from './run-companion-modules';
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

const UpdateCheckStateSchema = Schema.fromJsonString(
  Schema.Struct({
    lastChecked: Schema.String,
    latestVersion: Schema.String,
  })
);

/** Non-2xx response from the GitHub releases API; swallowed after the state write. */
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

function getCurrentBinaryAssetName(os: Pick<NodeOsShape, 'platform' | 'arch'>): string | undefined {
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
    const currentVersion = yield* resolveInstalledCliVersion(process.execPath, APP_VERSION);
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
    if (!Predicate.isObject(release)) continue;

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
  const readState = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const rawState = yield* fs.readFileString(config.stateFile);
    return yield* Schema.decodeUnknownEffect(UpdateCheckStateSchema)(rawState);
  });

  /**
   * If a cached newer version is known, print a one-line hint to stderr.
   * Reads a tiny JSON file and does a semver compare.
   */
  function showUpdateNotice(terminal: Pick<TerminalUI, 'capabilities' | 'error'>) {
    return Effect.gen(function* () {
      const capabilities = yield* terminal.capabilities;
      if (!capabilities.isInteractive) return;

      const state = yield* readState;
      if (!state.latestVersion || !semver.valid(state.latestVersion)) return;
      if (state.latestVersion === config.currentVersion) return;

      // Only show when the cached version is strictly newer.
      if (!semver.gt(state.latestVersion, config.currentVersion)) return;

      const msg =
        `  ${dim('Update available:')} ${dim(config.currentVersion)} ${dim('→')} ${bold(cyanBright(state.latestVersion))}\n` +
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

    // Throttle: skip if checked recently. A missing or corrupt state file
    // just means "re-check".
    const cachedState = yield* Effect.option(readState);
    if (
      Option.isSome(cachedState) &&
      Date.now() - new Date(cachedState.value.lastChecked).getTime() < config.checkIntervalMs
    ) {
      return;
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

    // Always persist lastChecked to prevent retry loops when the fetch
    // fails or returns no matching releases with a matching binary.
    const writeState = (latestVersion?: string) =>
      fs.makeDirectory(path.dirname(config.stateFile), { recursive: true }).pipe(
        Effect.matchEffect({
          // If we can't create the directory, bail out silently.
          onFailure: () => Effect.void,
          onSuccess: () => {
            const state: UpdateCheckState = {
              lastChecked: new Date().toISOString(),
              latestVersion: latestVersion ?? previousLatestVersion ?? config.currentVersion,
            };
            return fs.writeFileString(config.stateFile, JSON.stringify(state, null, 2));
          },
        })
      );

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

    yield* fetchLatestVersion.pipe(
      Effect.flatMap(writeState),
      // Silently ignore fetch/parse errors — never block the CLI.
      // Still update the timestamp to prevent unbounded retry loops.
      Effect.catch(() => Effect.ignore(writeState()))
    );
  });

  return { showUpdateNotice, checkForUpdate };
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

/** Fire-and-forget background fetch to GitHub. */
export function checkForUpdateInBackground(): void {
  // Runs from cli-main before the runtime boots; runPromiseExit never throws back
  // into the caller and checkForUpdate swallows its own failures.
  void Effect.runPromiseExit(
    Effect.gen(function* () {
      const stateFile = yield* defaultStateFile;
      const config = yield* defaultConfig(stateFile);
      yield* createUpdateChecker(config).checkForUpdate;
    }).pipe(Effect.provide(DefaultConfigLayers))
  );
}
