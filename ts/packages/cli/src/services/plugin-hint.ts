import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Context, Effect, Exit, Layer, Option, Schema } from 'effect';
import { APP_CONFIG } from 'src/config';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { commandPathOf } from 'src/invocation/command-identity';
import { AGENT_HOST_LABELS, COMPOSIO_AGENT_PLUGIN_ID, type AgentHost } from './agent-host';
import { detectPluginHost, hostConfigDirectory, rawHostEnvironment } from './agent-host-env';
import {
  CommandLifecycleTelemetry,
  type CommandLifecycleTelemetryShape,
} from './command-lifecycle-telemetry';
import { NodeOs } from './node-os';
import type { InvocationHookShape } from './invocation-hook';
import { DEFAULT_CLI_INVOCATION_ORIGIN } from './runtime-cli-context';
import { TerminalUI } from './terminal-ui';

/**
 * One-line acquisition hint for the Composio agent plugin.
 *
 * The primary audience is the agent driving the CLI through a non-TTY shell,
 * so this line is intentionally not gated on stderr being a TTY. `composio setup`, which
 * installs the plugin, turns it off in its `CommandMeta`.
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
  /** The command the hint is shown for, as telemetry records it (`commandPathOf`). */
  readonly commandPath: string;
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

  const releaseHint = (host: AgentHost) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.remove(path.join(config.stateDirectory, `${host}.stamp`), { force: true });
    }).pipe(Effect.ignore);

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

  function showPluginHint(
    terminal: Pick<TerminalUI, 'error'>,
    telemetry: Pick<CommandLifecycleTelemetryShape, 'pluginHintShown'>
  ) {
    return Effect.gen(function* () {
      const host = config.host;
      if (host === undefined || config.invocationOrigin === 'run') {
        return;
      }
      if (!(yield* pluginAbsentByHost[host])) return;
      if (!(yield* claimHint(host))) return;
      // The stamp must not outlive a failed delivery: if printing the hint
      // does not succeed, release the claim so the next invocation can
      // retry instead of staying muted for the full interval. Tracking
      // below is best-effort by contract (the telemetry sink never
      // fails), so a delivered hint with a lost event is accepted.
      const printed = yield* Effect.exit(
        terminal.error(
          `Tip: running under ${AGENT_HOST_LABELS[host]} without the Composio plugin — 'composio setup --yes' installs it.`
        )
      );
      if (Exit.isFailure(printed)) {
        yield* releaseHint(host);
        return;
      }
      yield* telemetry.pluginHintShown({
        invocationOrigin: config.invocationOrigin ?? DEFAULT_CLI_INVOCATION_ORIGIN,
        commandPath: config.commandPath,
        agentHost: host,
      });
    }).pipe(Effect.ignore);
  }

  return { showPluginHint };
}

export const resolvePluginHintConfig = (commandPath: string) =>
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
      commandPath,
      claudeInstalledPluginsFile: path.join(claudeConfigDir, 'plugins', 'installed_plugins.json'),
      codexConfigFile: path.join(codexConfigDir, 'config.toml'),
      hintIntervalMs: HINT_INTERVAL_MS,
    } satisfies PluginHintConfig;
  });

export type PluginHintShape = InvocationHookShape;

/**
 * Prints the plugin acquisition hint when eligible, and reports that it was shown through
 * `CommandLifecycleTelemetry`. Never fails, never blocks on network.
 */
export class PluginHint extends Context.Service<PluginHint, PluginHintShape>()(
  'services/PluginHint'
) {
  static readonly Default: Layer.Layer<
    PluginHint,
    never,
    TerminalUI | CommandLifecycleTelemetry | FileSystem.FileSystem | Path.Path | NodeOs
  > = Layer.effect(
    PluginHint,
    Effect.gen(function* () {
      const terminal = yield* TerminalUI;
      const telemetry = yield* CommandLifecycleTelemetry;
      const services = Context.pick(
        FileSystem.FileSystem,
        Path.Path,
        NodeOs,
        TerminalUI
      )(yield* Effect.context<FileSystem.FileSystem | Path.Path | NodeOs | TerminalUI>());
      return PluginHint.of({
        run: ({ identity }) =>
          Effect.gen(function* () {
            const config = yield* resolvePluginHintConfig(commandPathOf(identity));
            yield* createPluginHint(config).showPluginHint(terminal, telemetry);
          }).pipe(
            Effect.provideContext(services),
            // The hint is advisory: a configuration it cannot read shows no hint.
            Effect.ignore
          ),
      });
    })
  );
}
