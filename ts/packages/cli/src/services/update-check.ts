// This module is invoked synchronously from bin.ts BEFORE the Effect runtime
// boots, so the @effect/platform FileSystem/Path/Os layers do not exist yet.
// eslint-disable-next-line no-restricted-imports -- sync cache read/mkdir before the Effect runtime boots
import { readFileSync, mkdirSync } from 'node:fs';
// eslint-disable-next-line no-restricted-imports -- fire-and-forget cache write runs in a bare promise chain, outside the Effect runtime
import { writeFile } from 'node:fs/promises';
// eslint-disable-next-line no-restricted-imports -- platform/arch resolved at module load to build the default config, pre-runtime
import { arch as getArch, platform as getPlatform } from 'node:os';
import { Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { Config, Effect, Layer, Option, Predicate, Schema } from 'effect';
import semver from 'semver';
import { bold, cyanBright, dim } from 'src/ui/colors';
import { APP_VERSION, GITHUB_REPO } from '../constants';
import { NodeOs } from './node-os';
import { resolveInstalledCliVersion } from './run-companion-modules';
import { TerminalUI } from './terminal-ui';

/**
 * Background update check for @composio/cli.
 *
 * Two entry points, both called synchronously from bin.ts BEFORE the Effect
 * runtime boots — they must never block or throw:
 *
 *   showUpdateNotice()              — sync file read (~1 ms)
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

const UpdateCheckStateSchema = Schema.parseJson(
  Schema.Struct({
    lastChecked: Schema.String,
    latestVersion: Schema.String,
  })
);

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

function getCurrentBinaryAssetName(): string | undefined {
  const platform = getPlatform();
  const rawArch: string = getArch();
  if (platform !== 'darwin' && platform !== 'linux') return undefined;

  const arch = rawArch === 'arm64' || rawArch === 'aarch64' ? 'aarch64' : rawArch;
  if (arch !== 'x64' && arch !== 'aarch64') return undefined;

  return `composio-${platform}-${arch}.zip`;
}

const defaultConfig = (stateFile: string) =>
  Effect.gen(function* () {
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
      binaryAssetName: getCurrentBinaryAssetName(),
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
  // checkForUpdate runs in a bare promise chain outside the Effect runtime, so
  // the Path service is materialized from its pure default layer instead of
  // being yielded from context.
  const path = Effect.runSync(Path.Path.pipe(Effect.provide(Path.layer)));

  /**
   * If a cached newer version is known, print a one-line hint to stderr.
   * Purely synchronous — reads a tiny JSON file and does a semver compare.
   */
  function showUpdateNotice(terminal: Pick<TerminalUI, 'capabilities' | 'error'>) {
    return Effect.gen(function* () {
      const capabilities = yield* terminal.capabilities;
      if (!capabilities.isInteractive) return;

      const rawState = yield* Effect.try(() => readFileSync(config.stateFile, 'utf-8'));
      const state = yield* Schema.decodeUnknown(UpdateCheckStateSchema)(rawState);
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
   * Returns the internal promise so tests can await completion.
   * The public wrapper discards it (fire-and-forget).
   */
  function checkForUpdate(): Promise<void> | undefined {
    // eslint-disable-next-line no-restricted-syntax -- pre-runtime fire-and-forget path; must never throw back into bin.ts
    try {
      // Throttle: skip if checked recently.
      let previousLatestVersion: string | undefined;
      // eslint-disable-next-line no-restricted-syntax -- ENOENT/corrupt state file just means "re-check"; no Effect runtime is available here
      try {
        const state = Schema.decodeUnknownSync(UpdateCheckStateSchema)(
          readFileSync(config.stateFile, 'utf-8')
        );
        if (Date.now() - new Date(state.lastChecked).getTime() < config.checkIntervalMs) {
          return undefined;
        }
        previousLatestVersion = state.latestVersion;
      } catch {
        // ENOENT or corrupt file — re-check.
      }

      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': `composio-cli/${config.currentVersion}`,
      };

      if (config.accessToken) {
        headers.Authorization = `Bearer ${config.accessToken}`;
      }

      // Always persist lastChecked to prevent retry loops when the fetch
      // fails or returns no matching releases with a matching binary.
      const writeState = (latestVersion?: string): Promise<void> => {
        // eslint-disable-next-line no-restricted-syntax -- mkdir failure bails out silently inside a bare promise chain, not an Effect
        try {
          const stateDir = path.dirname(config.stateFile);
          mkdirSync(stateDir, { recursive: true });
        } catch {
          // If we can't create the directory, bail out silently.
          return Promise.resolve();
        }

        const state: UpdateCheckState = {
          lastChecked: new Date().toISOString(),
          latestVersion: latestVersion ?? previousLatestVersion ?? config.currentVersion,
        };

        return writeFile(config.stateFile, JSON.stringify(state, null, 2)).then(() => {});
      };

      return config
        .fetchFn(config.releasesUrl, { headers, signal: AbortSignal.timeout(10_000) })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((releases: unknown) => {
          const latestVersion = parseLatestVersionFromReleases(releases, config.binaryAssetName);
          return writeState(latestVersion);
        })
        .catch(() => {
          // Silently ignore fetch/parse errors — never block the CLI.
          // Still update the timestamp to prevent unbounded retry loops.
          return writeState().catch(() => {});
        });
    } catch {
      // Silently ignore.
      return undefined;
    }
  }

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
      return createUpdateChecker(config).checkForUpdate();
    }).pipe(Effect.provide(DefaultConfigLayers))
  );
}
