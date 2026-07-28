import { Command as PlatformCommand, FileSystem, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import { Effect, Layer, Option, Predicate, Schema } from 'effect';
import semver from 'semver';
import { resolveInstalledSkillName, SKILL_RELEASE_TAG_FILENAME } from 'src/effects/install-skill';
import { CommandRunner } from './command-runner';
import { NodeOs } from './node-os';
import { getUpdateStatus, type UpdateStatus } from './update-check';

/**
 * Freshness report across every Composio artifact installed on this machine:
 * the CLI binary, the standalone agent skill, and the Claude Code / Codex
 * plugins. Powers `composio version --check`; agents and the plugins'
 * SessionStart hooks are the primary consumers, so every field is
 * machine-readable and a missing artifact is data, never an error.
 */

const PLUGIN_ID = 'composio@composio';
const MANIFEST_TIMEOUT_MS = 5_000;
const PLUGIN_LIST_TIMEOUT = '15 seconds';

export type ArtifactFreshness = 'up-to-date' | 'update-available' | 'not-installed' | 'unknown';

export interface ArtifactStatus {
  installed: boolean;
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
  status: ArtifactFreshness;
}

export interface FreshnessArtifacts {
  cli: ArtifactStatus;
  skill: ArtifactStatus;
  claudePlugin: ArtifactStatus;
  codexPlugin: ArtifactStatus;
}

export interface FreshnessReport extends UpdateStatus {
  artifacts: FreshnessArtifacts;
}

export interface PluginProbe {
  readonly executable: string;
  /** Key holding the plugin records when the host wraps them in an object. */
  readonly recordsKey: string | undefined;
  /** plugin.json at default-branch HEAD — what hosts actually install, and CDN-cached. */
  readonly manifestUrl: string;
}

export const CLAUDE_PLUGIN_PROBE: PluginProbe = {
  executable: 'claude',
  recordsKey: undefined,
  manifestUrl:
    'https://raw.githubusercontent.com/ComposioHQ/composio-plugin-cc/HEAD/plugins/composio/.claude-plugin/plugin.json',
};

export const CODEX_PLUGIN_PROBE: PluginProbe = {
  executable: 'codex',
  recordsKey: 'installed',
  manifestUrl:
    'https://raw.githubusercontent.com/ComposioHQ/composio-plugin-openai/HEAD/plugins/composio/.codex-plugin/plugin.json',
};

export interface FreshnessConfig {
  readonly skillDir: string;
  readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── Pure helpers ────────────────────────────────────────────────────────

const decodeJson = Schema.decodeUnknownOption(Schema.parseJson());

/** Extract the semver from a `@composio/cli@<version>` release tag. */
export function parseReleaseTagVersion(tag: string): string | null {
  const match = /^@composio\/cli@(.+)$/.exec(tag.trim());
  if (!match) return null;
  const version = match[1];
  if (version === undefined || semver.valid(version) === null) return null;
  return version;
}

export type InstalledPluginProbe =
  { readonly installed: false } | { readonly installed: true; readonly version: string | null };

/**
 * Find the Composio plugin in a host's `plugin list --json` output.
 * Returns undefined when the output cannot be interpreted.
 */
export function parsePluginList(
  output: string,
  recordsKey: string | undefined
): InstalledPluginProbe | undefined {
  const parsed = Option.getOrUndefined(decodeJson(output));
  let records: unknown = parsed;
  if (recordsKey !== undefined) {
    if (!Predicate.isRecord(parsed)) return undefined;
    records = parsed[recordsKey];
  }
  if (!Array.isArray(records)) return undefined;

  const matches: Record<string, unknown>[] = [];
  for (const record of records) {
    if (!Predicate.isRecord(record)) continue;
    const id = record.id ?? record.pluginId;
    if (id !== PLUGIN_ID || record.installed === false) continue;
    matches.push(record);
  }
  const chosen = matches.find(record => record.enabled !== false) ?? matches[0];
  if (chosen === undefined) return { installed: false };

  const version = chosen.version;
  if (typeof version === 'string' && semver.valid(version) !== null) {
    return { installed: true, version };
  }
  return { installed: true, version: null };
}

/** Read the `version` field out of a plugin.json manifest body. */
export function parseManifestVersion(body: string): string | null {
  const parsed = Option.getOrUndefined(decodeJson(body));
  if (!Predicate.isRecord(parsed)) return null;
  const version = parsed.version;
  if (typeof version !== 'string' || semver.valid(version) === null) return null;
  return version;
}

export function deriveArtifactStatus(
  installed: boolean | undefined,
  current: string | null,
  latest: string | null
): ArtifactStatus {
  if (installed === undefined) {
    return { installed: false, current: null, latest, updateAvailable: false, status: 'unknown' };
  }
  if (!installed) {
    return {
      installed: false,
      current: null,
      latest,
      updateAvailable: false,
      status: 'not-installed',
    };
  }
  let validCurrent: string | null = null;
  if (current !== null) {
    validCurrent = semver.valid(current);
  }
  let validLatest: string | null = null;
  if (latest !== null) {
    validLatest = semver.valid(latest);
  }
  if (validCurrent === null || validLatest === null) {
    return { installed: true, current, latest, updateAvailable: false, status: 'unknown' };
  }
  if (semver.gt(validLatest, validCurrent)) {
    return { installed: true, current, latest, updateAvailable: true, status: 'update-available' };
  }
  return { installed: true, current, latest, updateAvailable: false, status: 'up-to-date' };
}

/** Project the CLI's own update status into the shared artifact shape. */
export function cliArtifactStatus(status: UpdateStatus): ArtifactStatus {
  const base = {
    installed: true,
    current: status.current,
    latest: status.latestStable,
  };
  if (status.checkStatus === 'update-available') {
    return { ...base, updateAvailable: true, status: 'update-available' };
  }
  if (status.checkStatus === 'up-to-date') {
    return { ...base, updateAvailable: false, status: 'up-to-date' };
  }
  return { ...base, updateAvailable: false, status: 'unknown' };
}

// ── Factory ─────────────────────────────────────────────────────────────

export function createFreshnessReporter(config: FreshnessConfig) {
  const fetchManifestVersion = (url: string) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise(() =>
        config.fetchFn(url, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) })
      );
      if (!response.ok) return null;
      const body = yield* Effect.tryPromise(() => response.text());
      return parseManifestVersion(body);
    }).pipe(Effect.orElseSucceed(() => null));

  /**
   * The skill ships with every CLI release, so its latest version is the
   * CLI's latest stable release.
   */
  const skillStatus = (latestReleaseVersion: string | null) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tag = yield* fs
        .readFileString(path.join(config.skillDir, SKILL_RELEASE_TAG_FILENAME))
        .pipe(
          Effect.map(value => value.trim()),
          Effect.option
        );
      if (Option.isSome(tag) && tag.value !== '') {
        const version = parseReleaseTagVersion(tag.value);
        return deriveArtifactStatus(true, version ?? tag.value, latestReleaseVersion);
      }
      const exists = yield* fs.exists(config.skillDir).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return deriveArtifactStatus(false, null, latestReleaseVersion);
      }
      return deriveArtifactStatus(true, null, latestReleaseVersion);
    });

  const listInstalledPlugin = (probe: PluginProbe) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner;
      const result = yield* runner
        .capture(PlatformCommand.make(probe.executable, 'plugin', 'list', '--json'))
        .pipe(Effect.timeout(PLUGIN_LIST_TIMEOUT));
      if (result.exitCode !== 0) return undefined;
      return parsePluginList(result.stdout, probe.recordsKey);
    }).pipe(
      Effect.catchTag('SystemError', error => {
        if (error.reason === 'NotFound') {
          return Effect.succeed<InstalledPluginProbe | undefined>({ installed: false });
        }
        return Effect.succeed<InstalledPluginProbe | undefined>(undefined);
      }),
      Effect.catchAll(() => Effect.succeed<InstalledPluginProbe | undefined>(undefined))
    );

  const pluginStatus = (probe: PluginProbe) =>
    Effect.gen(function* () {
      const [installedProbe, latest] = yield* Effect.all(
        [listInstalledPlugin(probe), fetchManifestVersion(probe.manifestUrl)],
        { concurrency: 'unbounded' }
      );
      if (installedProbe === undefined) {
        return deriveArtifactStatus(undefined, null, latest);
      }
      if (!installedProbe.installed) {
        return deriveArtifactStatus(false, null, latest);
      }
      return deriveArtifactStatus(true, installedProbe.version, latest);
    });

  const collectArtifacts = (cli: UpdateStatus) =>
    Effect.gen(function* () {
      const [skill, claudePlugin, codexPlugin] = yield* Effect.all(
        [
          skillStatus(cli.latestStable),
          pluginStatus(CLAUDE_PLUGIN_PROBE),
          pluginStatus(CODEX_PLUGIN_PROBE),
        ],
        { concurrency: 'unbounded' }
      );
      return { cli: cliArtifactStatus(cli), skill, claudePlugin, codexPlugin };
    });

  return { fetchManifestVersion, skillStatus, pluginStatus, collectArtifacts };
}

// ── Public API (production defaults) ────────────────────────────────────

const DefaultLayers = Layer.mergeAll(BunContext.layer, NodeOs.Default, CommandRunner.Default);

/**
 * Refresh the CLI release cache if stale and assemble the full per-artifact
 * freshness report. Powers `composio version --check`.
 */
export const getFreshnessReport: Effect.Effect<FreshnessReport> = Effect.gen(function* () {
  const cli = yield* getUpdateStatus;
  const path = yield* Path.Path;
  const os = yield* NodeOs;
  const reporter = createFreshnessReporter({
    skillDir: path.join(os.homedir, '.agents', 'skills', resolveInstalledSkillName()),
    fetchFn: fetch,
  });
  const artifacts = yield* reporter.collectArtifacts(cli);
  return { ...cli, artifacts } satisfies FreshnessReport;
}).pipe(Effect.provide(DefaultLayers));
