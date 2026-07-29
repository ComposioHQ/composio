import { describe, it, expect, beforeEach, afterEach } from '@effect/vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { makeTerminalUI, type TerminalUI } from 'src/services/terminal-ui';
import {
  createPluginHint,
  detectPluginHost,
  type PluginHintConfig,
  type PluginHintState,
} from 'src/services/plugin-hint';

const PlatformLayers = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

const DAY_MS = 24 * 60 * 60 * 1000;

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'plugin-hint-test-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeConfig(overrides?: Partial<PluginHintConfig>): PluginHintConfig {
  return {
    stateFile: join(tempDir, '.composio', 'plugin-hint.json'),
    host: 'claude',
    invocationOrigin: undefined,
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

function writeHintState(config: PluginHintConfig, state: PluginHintState): void {
  writeFileAt(config.stateFile, JSON.stringify(state));
}

function writeClaudePlugins(config: PluginHintConfig, plugins: Record<string, unknown[]>): void {
  writeFileAt(config.claudeInstalledPluginsFile, JSON.stringify({ version: 2, plugins }));
}

describe('detectPluginHost', () => {
  it('detects Claude Code from CLAUDECODE', () => {
    expect(
      detectPluginHost({ claudeCode: '1', codexThreadId: undefined, codexSandbox: undefined })
    ).toBe('claude');
  });

  it('detects Codex from CODEX_THREAD_ID', () => {
    expect(
      detectPluginHost({ claudeCode: undefined, codexThreadId: 'abc', codexSandbox: undefined })
    ).toBe('codex');
  });

  it('detects Codex from CODEX_SANDBOX', () => {
    expect(
      detectPluginHost({
        claudeCode: undefined,
        codexThreadId: undefined,
        codexSandbox: 'seatbelt',
      })
    ).toBe('codex');
  });

  it('prefers Claude Code when both markers are present', () => {
    expect(
      detectPluginHost({ claudeCode: '1', codexThreadId: 'abc', codexSandbox: undefined })
    ).toBe('claude');
  });

  it('detects no host without markers', () => {
    expect(
      detectPluginHost({ claudeCode: undefined, codexThreadId: undefined, codexSandbox: undefined })
    ).toBeUndefined();
  });
});

describe('showPluginHint', () => {
  let output: string[];

  beforeEach(() => {
    output = [];
  });

  it.effect('shows the hint when the Claude plugin state file is missing', () =>
    Effect.gen(function* () {
      const config = makeConfig();

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
      expect(output[0]).toContain('Claude Code');
      expect(output[0]).toContain('composio setup');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('shows the hint when the Claude plugin is not installed', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeClaudePlugins(config, { 'other@marketplace': [{ scope: 'user' }] });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('shows the hint when the Claude plugin entry has no installations', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeClaudePlugins(config, { 'composio@composio': [] });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('stays silent when the Claude plugin is installed', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeClaudePlugins(config, { 'composio@composio': [{ scope: 'user' }] });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toEqual([]);
      expect(existsSync(config.stateFile)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('stays silent when the Claude plugin state file is unreadable', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeFileAt(config.claudeInstalledPluginsFile, 'not json{');

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('shows the hint when the Codex config has no plugin section', () =>
    Effect.gen(function* () {
      const config = makeConfig({ host: 'codex' });
      writeFileAt(config.codexConfigFile, '[plugins."glen@glen"]\nenabled = true\n');

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
      expect(output[0]).toContain('Codex');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('shows the hint when the Codex config file is missing', () =>
    Effect.gen(function* () {
      const config = makeConfig({ host: 'codex' });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('stays silent when the Codex config has the plugin section', () =>
    Effect.gen(function* () {
      const config = makeConfig({ host: 'codex' });
      writeFileAt(config.codexConfigFile, '[plugins."composio@composio"]\nenabled = true\n');

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('stays silent outside a plugin-capable host', () =>
    Effect.gen(function* () {
      const config = makeConfig({ host: undefined });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('stays silent when invoked from a composio run child', () =>
    Effect.gen(function* () {
      const config = makeConfig({ invocationOrigin: 'run' });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('stays silent when the hint was shown within the interval', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeHintState(config, { lastHintShown: new Date().toISOString() });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('shows the hint again after the interval elapses', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeHintState(config, { lastHintShown: '2000-01-01T00:00:00.000Z' });

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('shows the hint when the throttle state file is unreadable', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeFileAt(config.stateFile, 'not json{');

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('stamps the throttle state when the hint is shown', () =>
    Effect.gen(function* () {
      const config = makeConfig();

      yield* createPluginHint(config).showPluginHint(makeTerminal(output));

      expect(output).toHaveLength(1);
      expect(existsSync(config.stateFile)).toBe(true);
      output = [];
      yield* createPluginHint(config).showPluginHint(makeTerminal(output));
      expect(output).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
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

      yield* createPluginHint(config).showPluginHint(terminal);

      expect(chunks.join('')).toContain('composio setup');
    }).pipe(Effect.provide(PlatformLayers))
  );
});
