import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { Config, ConfigProvider, Effect, Layer, Option, Schema } from 'effect';
import { NodeOs } from './node-os';
import { TerminalUI } from './terminal-ui';

/**
 * One-line acquisition hint for the Composio agent plugin.
 *
 * When the bare CLI runs inside a plugin-capable agent host (Claude Code,
 * Codex) and the Composio plugin is not installed there, print one throttled
 * tip to stderr. The primary audience is the agent driving the CLI through a
 * non-TTY shell, so unlike the rest of the CLI's decoration this line is NOT
 * gated on stderr being a TTY.
 */

const HINT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PLUGIN_ID = 'composio@composio';

export type PluginHost = 'claude' | 'codex';

const HOST_LABELS: Record<PluginHost, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export interface HostEnvMarkers {
  readonly claudeCode: string | undefined;
  readonly codexThreadId: string | undefined;
  readonly codexSandbox: string | undefined;
}

export function detectPluginHost(markers: HostEnvMarkers): PluginHost | undefined {
  if (markers.claudeCode !== undefined) return 'claude';
  if (markers.codexThreadId !== undefined || markers.codexSandbox !== undefined) return 'codex';
  return undefined;
}

export interface PluginHintState {
  lastHintShown: string; // ISO-8601
}

const PluginHintStateSchema = Schema.parseJson(
  Schema.Struct({
    lastHintShown: Schema.String,
  })
);

const InstalledPluginsSchema = Schema.parseJson(
  Schema.Struct({
    plugins: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.Unknown) }),
  })
);

export interface PluginHintConfig {
  readonly stateFile: string;
  readonly host: PluginHost | undefined;
  readonly invocationOrigin: string | undefined;
  readonly claudeInstalledPluginsFile: string;
  readonly codexConfigFile: string;
  readonly hintIntervalMs: number;
}

export function createPluginHint(config: PluginHintConfig) {
  const readState = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const rawState = yield* fs.readFileString(config.stateFile);
    return yield* Schema.decodeUnknown(PluginHintStateSchema)(rawState);
  });

  const writeState = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const state: PluginHintState = { lastHintShown: new Date().toISOString() };
    yield* fs.makeDirectory(path.dirname(config.stateFile), { recursive: true });
    yield* fs.writeFileString(config.stateFile, JSON.stringify(state, null, 2));
  });

  const shownWithinInterval = (state: Option.Option<PluginHintState>): boolean => {
    if (Option.isNone(state)) return false;
    const shownAt = new Date(state.value.lastHintShown).getTime();
    if (!Number.isFinite(shownAt)) return false;
    return Date.now() - shownAt < config.hintIntervalMs;
  };

  // "Confidently absent" only: a missing state file means the plugin was never
  // installed, while an unreadable or unrecognized one suppresses the hint.
  const claudePluginAbsent = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const fileExists = yield* fs.exists(config.claudeInstalledPluginsFile);
    if (!fileExists) return true;
    const raw = yield* fs.readFileString(config.claudeInstalledPluginsFile);
    const decoded = yield* Effect.option(Schema.decodeUnknown(InstalledPluginsSchema)(raw));
    if (Option.isNone(decoded)) return false;
    const installs = decoded.value.plugins[PLUGIN_ID];
    if (installs === undefined) return true;
    return installs.length === 0;
  });

  const codexPluginAbsent = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const fileExists = yield* fs.exists(config.codexConfigFile);
    if (!fileExists) return true;
    const raw = yield* fs.readFileString(config.codexConfigFile);
    return !raw.includes(`[plugins."${PLUGIN_ID}"]`);
  });

  const pluginAbsentByHost: Record<
    PluginHost,
    Effect.Effect<boolean, unknown, FileSystem.FileSystem>
  > = {
    claude: claudePluginAbsent,
    codex: codexPluginAbsent,
  };

  function showPluginHint(terminal: Pick<TerminalUI, 'error'>) {
    return Effect.gen(function* () {
      if (config.host === undefined) return;
      if (config.invocationOrigin === 'run') return;
      const state = yield* Effect.option(readState);
      if (shownWithinInterval(state)) return;
      const absent = yield* pluginAbsentByHost[config.host];
      if (!absent) return;
      yield* writeState;
      const label = HOST_LABELS[config.host];
      yield* terminal.error(
        `Tip: running under ${label} without the Composio plugin — 'composio setup' installs it.`
      );
    }).pipe(Effect.ignore);
  }

  return { showPluginHint };
}

const DefaultConfigLayers = Layer.mergeAll(Path.layer, NodeOs.Default, BunFileSystem.layer);

const readOptionalEnv = (name: string) =>
  Effect.orDie(Config.option(Config.string(name)).pipe(Config.map(Option.getOrUndefined)));

// Env reads bypass the CLI's runtime ConfigProvider (which prefixes every key
// with COMPOSIO_) because these are host-owned variables under their raw names.
const defaultConfig = Effect.gen(function* () {
  const path = yield* Path.Path;
  const os = yield* NodeOs;
  const claudeCode = yield* readOptionalEnv('CLAUDECODE');
  const codexThreadId = yield* readOptionalEnv('CODEX_THREAD_ID');
  const codexSandbox = yield* readOptionalEnv('CODEX_SANDBOX');
  const invocationOrigin = yield* readOptionalEnv('COMPOSIO_CLI_INVOCATION_ORIGIN');
  const claudeConfigDir = yield* readOptionalEnv('CLAUDE_CONFIG_DIR');
  const codexHome = yield* readOptionalEnv('CODEX_HOME');
  return {
    stateFile: path.join(os.homedir, '.composio', 'plugin-hint.json'),
    host: detectPluginHost({ claudeCode, codexThreadId, codexSandbox }),
    invocationOrigin,
    claudeInstalledPluginsFile: path.join(
      claudeConfigDir ?? path.join(os.homedir, '.claude'),
      'plugins',
      'installed_plugins.json'
    ),
    codexConfigFile: path.join(codexHome ?? path.join(os.homedir, '.codex'), 'config.toml'),
    hintIntervalMs: HINT_INTERVAL_MS,
  } satisfies PluginHintConfig;
}).pipe(Effect.withConfigProvider(ConfigProvider.fromEnv()));

/** Print the plugin acquisition hint when eligible. Never fails, never blocks on network. */
export const showPluginAcquisitionHint = Effect.gen(function* () {
  const terminal = yield* TerminalUI;
  const config = yield* defaultConfig;
  yield* createPluginHint(config).showPluginHint(terminal);
}).pipe(Effect.provide(DefaultConfigLayers));
