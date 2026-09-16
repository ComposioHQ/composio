import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { Effect, Layer, Option, Schema } from 'effect';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { getPluginHintShownEvent } from 'src/analytics/events';
import { APP_CONFIG } from 'src/effects/app-config';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { APP_VERSION } from 'src/constants';
import { AGENT_HOST_LABELS, COMPOSIO_AGENT_PLUGIN_ID, type AgentHost } from './agent-host';
import { detectPluginHost, hostConfigDirectory, rawHostEnvironment } from './agent-host-env';
import { NodeOs } from './node-os';
import { DEFAULT_CLI_INVOCATION_ORIGIN } from './runtime-cli-context';
import { TerminalUI } from './terminal-ui';

/**
 * One-line acquisition hint for the Composio agent plugin.
 *
 * The primary audience is the agent driving the CLI through a non-TTY shell,
 * so this line is intentionally not gated on stderr being a TTY.
 */

const HINT_INTERVAL_MS = 24 * 60 * 60 * 1000;

const InstalledPluginsSchema = Schema.fromJsonString(
  Schema.Struct({
    plugins: Schema.Record(Schema.String, Schema.Array(Schema.Unknown)),
  })
);

export interface PluginHintConfig {
  readonly stateDirectory: string;
  readonly host: AgentHost | undefined;
  readonly invocationOrigin: string | undefined;
  readonly commandName: string | undefined;
  readonly claudeInstalledPluginsFile: string;
  readonly codexConfigFile: string;
  readonly hintIntervalMs: number;
}

export function createPluginHint(config: PluginHintConfig) {
  const claimHint = (host: AgentHost) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const stampPath = path.join(config.stateDirectory, `${host}.stamp`);
      yield* fs.makeDirectory(config.stateDirectory, { recursive: true });

      const stampInfo = yield* Effect.option(fs.stat(stampPath));
      if (Option.isSome(stampInfo)) {
        const shownAt = Option.getOrUndefined(stampInfo.value.mtime)?.getTime();
        if (
          shownAt !== undefined &&
          Number.isFinite(shownAt) &&
          Date.now() - shownAt < config.hintIntervalMs
        ) {
          return false;
        }

        // Retiring via rename means only one concurrent process can replace a
        // stale stamp. Everyone else either sees the new stamp or loses the
        // exclusive create below.
        const retiredPath = `${stampPath}.${crypto.randomUUID()}`;
        const retired = yield* Effect.option(fs.rename(stampPath, retiredPath));
        yield* fs.remove(retiredPath, { force: true }).pipe(Effect.ignore);
        if (Option.isNone(retired)) return false;
      }

      return yield* Effect.scoped(fs.open(stampPath, { flag: 'wx' })).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false)
      );
    }).pipe(Effect.orElseSucceed(() => false));

  // "Confidently absent" only: a missing state file means the plugin was never
  // installed, while an unreadable or unrecognized one suppresses the hint.
  const claudePluginAbsent = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(config.claudeInstalledPluginsFile))) return true;
    const raw = yield* fs.readFileString(config.claudeInstalledPluginsFile);
    const decoded = yield* Effect.option(Schema.decodeUnknownEffect(InstalledPluginsSchema)(raw));
    if (Option.isNone(decoded)) return false;
    const installs = decoded.value.plugins[COMPOSIO_AGENT_PLUGIN_ID];
    return installs === undefined || installs.length === 0;
  });

  const codexPluginAbsent = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(config.codexConfigFile))) return true;
    const raw = yield* fs.readFileString(config.codexConfigFile);
    return !raw.includes(`[plugins."${COMPOSIO_AGENT_PLUGIN_ID}"]`);
  });

  const pluginAbsentByHost: Readonly<
    Record<AgentHost, Effect.Effect<boolean, unknown, FileSystem.FileSystem>>
  > = {
    claude: claudePluginAbsent,
    codex: codexPluginAbsent,
  };

  function showPluginHint(terminal: Pick<TerminalUI, 'error'>) {
    return Effect.gen(function* () {
      const host = config.host;
      if (
        host === undefined ||
        config.invocationOrigin === 'run' ||
        config.commandName === 'setup'
      ) {
        return;
      }
      if (!(yield* pluginAbsentByHost[host])) return;
      if (!(yield* claimHint(host))) return;
      yield* terminal.error(
        `Tip: running under ${AGENT_HOST_LABELS[host]} without the Composio plugin — 'composio setup --yes' installs it.`
      );
      yield* trackCliEventEffect(
        getPluginHintShownEvent({
          invocationOrigin: config.invocationOrigin ?? DEFAULT_CLI_INVOCATION_ORIGIN,
          cliVersion: APP_VERSION,
          commandPath: config.commandName ?? 'composio',
          agentHost: host,
        })
      );
    }).pipe(Effect.ignore);
  }

  return { showPluginHint };
}

const DefaultConfigLayers = Layer.mergeAll(Path.layer, NodeOs.Default, BunFileSystem.layer);

export function findRootCommandName(argv: ReadonlyArray<string>): string | undefined {
  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--log-level') {
      index += 1;
      continue;
    }
    if (token?.startsWith('--log-level=') || token?.startsWith('-')) {
      continue;
    }
    return token;
  }
  return undefined;
}

export const resolvePluginHintConfig = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cacheDir = yield* setupCacheDir;
    const invocationOrigin = yield* APP_CONFIG.CLI_INVOCATION_ORIGIN;
    const env = yield* rawHostEnvironment;
    const claudeConfigDir = yield* hostConfigDirectory('claude');
    const codexConfigDir = yield* hostConfigDirectory('codex');
    return {
      stateDirectory: path.join(cacheDir, 'plugin-hints'),
      host: detectPluginHost(env),
      invocationOrigin,
      commandName: findRootCommandName(argv),
      claudeInstalledPluginsFile: path.join(claudeConfigDir, 'plugins', 'installed_plugins.json'),
      codexConfigFile: path.join(codexConfigDir, 'config.toml'),
      hintIntervalMs: HINT_INTERVAL_MS,
    } satisfies PluginHintConfig;
  });

/** Print the plugin acquisition hint when eligible. Never fails, never blocks on network. */
export const showPluginAcquisitionHint = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const terminal = yield* TerminalUI;
    const config = yield* resolvePluginHintConfig(argv);
    yield* createPluginHint(config).showPluginHint(terminal);
  }).pipe(Effect.provide(DefaultConfigLayers));
