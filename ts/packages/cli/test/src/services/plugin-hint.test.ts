import { describe, expect, it } from '@effect/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import * as BunServices from '@effect/platform-bun/BunServices';
import { ConfigProvider, Effect, Layer } from 'effect';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { HOST_CONFIG } from 'src/config';
import { APP_VERSION } from 'src/constants';
import {
  CommandLifecycleTelemetry,
  type PluginHintShown,
} from 'src/services/command-lifecycle-telemetry';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { detectPluginHost } from 'src/services/agent-host-env';
import {
  createPluginHint,
  PluginHint,
  resolvePluginHintConfig,
  type PluginHintConfig,
} from 'src/services/plugin-hint';
import { makeTerminalUI, TerminalUI } from 'src/services/terminal-ui';
import { commandIdentity } from 'test/__utils__/command-identity';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { trackedEvents } from 'test/__utils__/tracked-events';

vi.mock('src/analytics/dispatch', async importOriginal => {
  const { recordTrackedEvent } = await import('test/__utils__/tracked-events');
  return {
    ...(await importOriginal<typeof import('src/analytics/dispatch')>()),
    trackCliEventEffect: recordTrackedEvent,
  };
});

const DAY_MS = 24 * 60 * 60 * 1000;

let tempDir: string;
/** What the hint reported through `telemetry` in the current test. */
let shownEvents: PluginHintShown[];
const telemetry = {
  pluginHintShown: (shown: PluginHintShown) => Effect.sync(() => shownEvents.push(shown)),
};
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'plugin-hint-test-'));
  shownEvents = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  trackedEvents.length = 0;
  rmSync(tempDir, { recursive: true, force: true });
});

const hintLayers = () =>
  Layer.mergeAll(
    BunServices.layer,
    NodeProcess.Default,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempDir })),
    Layer.succeed(TerminalUI, terminalUITestImpl)
  );

function makeConfig(overrides?: Partial<PluginHintConfig>): PluginHintConfig {
  return {
    stateDirectory: join(tempDir, '.composio', 'plugin-hints'),
    host: 'claude',
    invocationOrigin: undefined,
    commandPath: 'version',
    claudeInstalledPluginsFile: join(tempDir, '.claude', 'plugins', 'installed_plugins.json'),
    codexConfigFile: join(tempDir, '.codex', 'config.toml'),
    hintIntervalMs: DAY_MS,
    ...overrides,
  };
}

const makeTerminal = (output: string[]): Pick<TerminalUI, 'error'> => ({
  error: line => Effect.sync(() => output.push(line)),
});

function writeFileAt(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function writeClaudePlugins(config: PluginHintConfig, plugins: Record<string, unknown[]>): void {
  writeFileAt(config.claudeInstalledPluginsFile, JSON.stringify({ version: 2, plugins }));
}

describe('detectPluginHost', () => {
  it('detects supported hosts from non-empty markers', () => {
    expect(
      detectPluginHost({ claudeCode: '1', codexThreadId: undefined, codexSandbox: undefined })
    ).toBe('claude');
    expect(
      detectPluginHost({ claudeCode: undefined, codexThreadId: 'abc', codexSandbox: undefined })
    ).toBe('codex');
    expect(
      detectPluginHost({
        claudeCode: undefined,
        codexThreadId: undefined,
        codexSandbox: 'seatbelt',
      })
    ).toBe('codex');
  });

  it('prefers Claude Code when both hosts have non-empty markers', () => {
    expect(
      detectPluginHost({ claudeCode: '1', codexThreadId: 'abc', codexSandbox: undefined })
    ).toBe('claude');
  });

  it.effect('ignores empty and whitespace-only markers', () =>
    Effect.gen(function* () {
      const markers = yield* HOST_CONFIG.AGENT_HOST.parse(
        ConfigProvider.fromEnvRecord({ CLAUDECODE: '', CODEX_THREAD_ID: '  ', CODEX_SANDBOX: '\t' })
      );
      expect(detectPluginHost(markers)).toBeUndefined();
    })
  );
});

describe('resolvePluginHintConfig', () => {
  it.effect('stores throttle stamps under COMPOSIO_CACHE_DIR', () => {
    const cacheDir = join(tempDir, 'writable-cache');
    vi.stubEnv('COMPOSIO_CACHE_DIR', cacheDir);
    vi.stubEnv('CLAUDECODE', '1');

    return Effect.gen(function* () {
      const config = yield* resolvePluginHintConfig('version');

      expect(config.stateDirectory).toBe(join(cacheDir, 'plugin-hints'));
      expect(config.host).toBe('claude');
      expect(config.commandPath).toBe('version');
    }).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv()),
      Effect.provide(hintLayers())
    );
  });

  it.effect('falls back to host defaults for blank path overrides', () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '');
    vi.stubEnv('CODEX_HOME', '   ');

    return Effect.gen(function* () {
      const config = yield* resolvePluginHintConfig('version');

      expect(config.claudeInstalledPluginsFile).toBe(
        join(tempDir, '.claude', 'plugins', 'installed_plugins.json')
      );
      expect(config.codexConfigFile).toBe(join(tempDir, '.codex', 'config.toml'));
    }).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv()),
      Effect.provide(hintLayers())
    );
  });

  it.effect('preserves nonblank path overrides', () => {
    const claudeConfigDir = join(tempDir, 'claude profile');
    const codexHome = join(tempDir, 'codex profile');
    vi.stubEnv('CLAUDE_CONFIG_DIR', claudeConfigDir);
    vi.stubEnv('CODEX_HOME', codexHome);

    return Effect.gen(function* () {
      const config = yield* resolvePluginHintConfig('version');

      expect(config.claudeInstalledPluginsFile).toBe(
        join(claudeConfigDir, 'plugins', 'installed_plugins.json')
      );
      expect(config.codexConfigFile).toBe(join(codexHome, 'config.toml'));
    }).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv()),
      Effect.provide(hintLayers())
    );
  });

  it.effect('anchors relative path overrides to the home directory', () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', 'claude-relative');
    vi.stubEnv('CODEX_HOME', 'codex-relative');

    return Effect.gen(function* () {
      const config = yield* resolvePluginHintConfig('version');

      expect(config.claudeInstalledPluginsFile).toBe(
        join(tempDir, 'claude-relative', 'plugins', 'installed_plugins.json')
      );
      expect(config.codexConfigFile).toBe(join(tempDir, 'codex-relative', 'config.toml'));
    }).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv()),
      Effect.provide(hintLayers())
    );
  });
});

describe('showPluginHint', () => {
  let output: string[];

  beforeEach(() => {
    output = [];
  });

  it.effect('shows the hint when a host plugin is confidently absent', () =>
    Effect.gen(function* () {
      const claudeConfig = makeConfig();
      writeClaudePlugins(claudeConfig, { 'other@marketplace': [{ scope: 'user' }] });
      yield* createPluginHint(claudeConfig).showPluginHint(makeTerminal(output), telemetry);

      const codexConfig = makeConfig({ host: 'codex' });
      writeFileAt(codexConfig.codexConfigFile, '[plugins."glen@glen"]\nenabled = true\n');
      yield* createPluginHint(codexConfig).showPluginHint(makeTerminal(output), telemetry);

      expect(output).toEqual([
        "Tip: running under Claude Code without the Composio plugin — 'composio setup --yes' installs it.",
        "Tip: running under Codex without the Composio plugin — 'composio setup --yes' installs it.",
      ]);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('releases the claim when printing fails so the next run can retry', () =>
    Effect.gen(function* () {
      const config = makeConfig();

      yield* createPluginHint(config).showPluginHint(
        { error: () => Effect.die(new Error('EPIPE')) },
        telemetry
      );
      expect(existsSync(join(config.stateDirectory, 'claude.stamp'))).toBe(false);

      yield* createPluginHint(config).showPluginHint(makeTerminal(output), telemetry);
      expect(output).toHaveLength(1);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('reports the hint to the telemetry service once per printed hint', () =>
    Effect.gen(function* () {
      const config = makeConfig({ invocationOrigin: 'installer', commandPath: 'whoami' });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output), telemetry);
      yield* createPluginHint(config).showPluginHint(makeTerminal(output), telemetry);

      expect(output).toHaveLength(1);
      expect(shownEvents).toEqual([
        { invocationOrigin: 'installer', commandPath: 'whoami', agentHost: 'claude' },
      ]);
      // The hint tracks nothing itself.
      expect(trackedEvents).toEqual([]);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('stays silent when the plugin is installed', () =>
    Effect.gen(function* () {
      const claudeConfig = makeConfig();
      writeClaudePlugins(claudeConfig, { 'composio@composio': [{ scope: 'user' }] });
      yield* createPluginHint(claudeConfig).showPluginHint(makeTerminal(output), telemetry);

      const codexConfig = makeConfig({ host: 'codex' });
      writeFileAt(codexConfig.codexConfigFile, '[plugins."composio@composio"]\nenabled = true\n');
      yield* createPluginHint(codexConfig).showPluginHint(makeTerminal(output), telemetry);

      expect(output).toEqual([]);
      expect(existsSync(claudeConfig.stateDirectory)).toBe(false);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('stays silent when plugin state is unreadable', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeFileAt(config.claudeInstalledPluginsFile, 'not json{');

      yield* createPluginHint(config).showPluginHint(makeTerminal(output), telemetry);

      expect(output).toEqual([]);
    }).pipe(Effect.provide(hintLayers()))
  );

  // `composio setup` turns the hint off in its `CommandMeta`; see
  // `test/src/invocation/invocation-hooks.test.ts`.
  it.effect('stays silent outside a host and in run children', () =>
    Effect.gen(function* () {
      const configs = [makeConfig({ host: undefined }), makeConfig({ invocationOrigin: 'run' })];

      yield* Effect.forEach(configs, config =>
        createPluginHint(config).showPluginHint(makeTerminal(output), telemetry)
      );

      expect(output).toEqual([]);
      expect(shownEvents).toEqual([]);
      expect(existsSync(configs[1]!.stateDirectory)).toBe(false);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('allows only one concurrent process to claim a host hint', () =>
    Effect.gen(function* () {
      const config = makeConfig();

      yield* Effect.all(
        Array.from({ length: 20 }, () =>
          createPluginHint(config).showPluginHint(makeTerminal(output), telemetry)
        ),
        { concurrency: 'unbounded' }
      );

      expect(output).toHaveLength(1);
      expect(existsSync(join(config.stateDirectory, 'claude.stamp'))).toBe(true);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('throttles each host independently', () =>
    Effect.gen(function* () {
      const claudeConfig = makeConfig({ host: 'claude' });
      const codexConfig = makeConfig({ host: 'codex' });

      yield* createPluginHint(claudeConfig).showPluginHint(makeTerminal(output), telemetry);
      yield* createPluginHint(codexConfig).showPluginHint(makeTerminal(output), telemetry);
      yield* createPluginHint(claudeConfig).showPluginHint(makeTerminal(output), telemetry);
      yield* createPluginHint(codexConfig).showPluginHint(makeTerminal(output), telemetry);

      expect(output).toHaveLength(2);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('retires a stale stamp and shows the hint again', () =>
    Effect.gen(function* () {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
      const config = makeConfig();
      const stamp = join(config.stateDirectory, 'claude.stamp');
      writeFileAt(stamp, '');
      const stale = new Date('2026-07-27T00:00:00.000Z');
      utimesSync(stamp, stale, stale);

      yield* createPluginHint(config).showPluginHint(makeTerminal(output), telemetry);

      expect(output).toHaveLength(1);
    }).pipe(Effect.provide(hintLayers()))
  );

  it.effect('writes to stderr even when no stream is a TTY', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      const chunks: string[] = [];
      const capture = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(String(chunk));
          callback();
        },
      });
      const terminal = makeTerminalUI({
        stdin: { isTTY: false },
        stdout: Object.assign(new Writable({ write: (_c, _e, cb) => cb() }), { isTTY: false }),
        stderr: Object.assign(capture, { isTTY: false }),
      });

      yield* createPluginHint(config).showPluginHint(terminal, telemetry);

      expect(chunks.join('')).toContain('composio setup');
    }).pipe(Effect.provide(hintLayers()))
  );
});

describe('PluginHint', () => {
  /**
   * `PluginHint.Default` over the real `CommandLifecycleTelemetry` (its dispatcher mocked above),
   * with every path under `tempDir` and a recording stderr.
   */
  const pluginHintLayer = (output: string[]) => {
    const services = Layer.mergeAll(
      BunServices.layer,
      Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempDir })),
      Layer.succeed(TerminalUI, TerminalUI.of({ ...terminalUITestImpl, ...makeTerminal(output) }))
    );
    return Layer.provide(
      PluginHint.Default,
      Layer.merge(services, Layer.provide(CommandLifecycleTelemetry.Default, services))
    );
  };

  /** Runs under Claude Code, which has no Composio plugin installed. */
  const underClaudeCode = Effect.provideService(
    ConfigProvider.ConfigProvider,
    ConfigProvider.fromEnvRecord({ CLAUDECODE: '1' })
  );

  it.effect(
    '[Given] Claude Code without the plugin [Then] prints the hint once per interval and tracks it through the telemetry service',
    () => {
      const output: string[] = [];
      const identity = commandIdentity(['dev', 'triggers', 'list']);
      return Effect.gen(function* () {
        const hint = yield* PluginHint;
        yield* hint.run({ identity });
        yield* hint.run({ identity });

        expect(output).toEqual([
          "Tip: running under Claude Code without the Composio plugin — 'composio setup --yes' installs it.",
        ]);
        expect(trackedEvents).toEqual([
          {
            name: 'CLI_PLUGIN_HINT_SHOWN',
            properties: expect.objectContaining({
              source: 'cli',
              invocation_origin: 'cli',
              cli_version: APP_VERSION,
              command_path: 'dev triggers list',
              agent_host: 'claude',
            }),
          },
        ]);
      }).pipe(underClaudeCode, Effect.provide(pluginHintLayer(output)));
    }
  );
});
