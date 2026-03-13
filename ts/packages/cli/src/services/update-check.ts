import { readFileSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import semver from 'semver';
import { bold, cyanBright, dim } from 'src/ui/colors';
import { APP_VERSION, GITHUB_REPO } from '../constants';

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
 *   Uses GitHub's `git/matching-refs` API with the prefix
 *   `tags/@composio/cli@` so only CLI tags are returned (tiny payload,
 *   no monorepo noise). The result is cached to ~/.composio/update-check.json
 *   and refreshed at most once every 24 hours.
 */

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Matches `refs/tags/@composio/cli@<semver>` — excludes prereleases. */
const CLI_REF_RE = /^refs\/tags\/@composio\/cli@(\d+\.\d+\.\d+)$/;

export interface UpdateCheckState {
  lastChecked: string; // ISO-8601
  latestVersion: string; // e.g. "0.3.0"
}

// ── Injectable configuration ────────────────────────────────────────────

/** Dependencies injected into the update checker — mirrors the Effect service pattern. */
export interface UpdateCheckConfig {
  readonly stateFile: string;
  readonly currentVersion: string;
  readonly checkIntervalMs: number;
  readonly refsUrl: string;
  readonly accessToken: string | undefined;
  readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
}

const _home = join(homedir(), '.composio');

const defaultConfig: UpdateCheckConfig = {
  stateFile: join(_home, 'update-check.json'),
  currentVersion: APP_VERSION,
  checkIntervalMs: CHECK_INTERVAL_MS,
  refsUrl: `${GITHUB_REPO.API_BASE_URL}/repos/${GITHUB_REPO.OWNER}/${GITHUB_REPO.REPO}/git/matching-refs/tags/@composio/cli@`,
  accessToken: process.env.COMPOSIO_GITHUB_ACCESS_TOKEN,
  fetchFn: fetch,
};

// ── Pure helpers ────────────────────────────────────────────────────────

/** Extract the highest stable semver from a GitHub matching-refs response. */
export function parseLatestVersionFromRefs(refs: unknown): string | undefined {
  if (!Array.isArray(refs)) return undefined;

  let latest: string | undefined;
  for (const ref of refs) {
    if (typeof ref !== 'object' || ref === null || !('ref' in ref) || typeof ref.ref !== 'string')
      continue;

    const match = CLI_REF_RE.exec(ref.ref);
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
  /**
   * If a cached newer version is known, print a one-line hint to stderr.
   * Purely synchronous — reads a tiny JSON file and does a semver compare.
   */
  function showUpdateNotice(): void {
    try {
      const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
      if (!state.latestVersion || !semver.valid(state.latestVersion)) return;
      if (state.latestVersion === config.currentVersion) return;

      // Only show when the cached version is strictly newer.
      if (!semver.gt(state.latestVersion, config.currentVersion)) return;

      const msg =
        `  ${dim('Update available:')} ${dim(config.currentVersion)} ${dim('→')} ${bold(cyanBright(state.latestVersion))}\n` +
        `  ${dim('Run')} ${cyanBright('composio upgrade')} ${dim('to update')}\n`;

      process.stderr.write(`\n${msg}\n`);
    } catch {
      // Silently ignore — ENOENT, corrupt JSON, etc. Never block the CLI.
    }
  }

  /**
   * Fetch the latest @composio/cli tag from GitHub via the lightweight
   * `git/matching-refs` endpoint, then write the result to the state file.
   *
   * Returns the internal promise so tests can await completion.
   * The public wrapper discards it (fire-and-forget).
   */
  function checkForUpdate(): Promise<void> | undefined {
    try {
      // Throttle: skip if checked recently.
      let previousLatestVersion: string | undefined;
      try {
        const state: UpdateCheckState = JSON.parse(readFileSync(config.stateFile, 'utf-8'));
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
      // fails or returns no matching tags.
      const writeState = (latestVersion?: string): Promise<void> => {
        try {
          const stateDir = dirname(config.stateFile);
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
        .fetchFn(config.refsUrl, { headers, signal: AbortSignal.timeout(10_000) })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((refs: unknown) => {
          const latestVersion = parseLatestVersionFromRefs(refs);
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

const _checker = createUpdateChecker(defaultConfig);

/** Print upgrade hint to stderr if a newer version is cached. */
export function showUpdateNotice(): void {
  _checker.showUpdateNotice();
}

/** Fire-and-forget background fetch to GitHub. */
export function checkForUpdateInBackground(): void {
  _checker.checkForUpdate();
}
