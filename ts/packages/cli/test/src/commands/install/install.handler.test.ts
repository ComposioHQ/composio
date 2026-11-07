import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import path from 'node:path';
import { Writable } from 'node:stream';
import * as tempy from 'tempy';
import { ShellSetupAbortError } from 'src/commands/install/install.errors';
import {
  BIN_DIR_NOT_ABSOLUTE_MESSAGE,
  BIN_DIR_UNSAFE_MESSAGE,
} from 'src/commands/install/install.format';
import { installShellIntegration, runInstall } from 'src/commands/install/install.handler';
import { CliUserConfig } from 'src/models/cli-user-config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { getTerminalCapabilities, makeTerminalUI, TerminalUI } from 'src/services/terminal-ui';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const BIN_DIR = '/opt/composio/bin';

const cliUserConfig = ComposioCliUserConfig.of({
  data: {
    channel: 'stable',
    developerModeEnabled: false,
    developerDangerousCommandsEnabled: false,
    experimentalFeatures: {},
    artifactDirectory: undefined,
    security: 'auto',
  },
  raw: CliUserConfig.make({
    developer: { enabled: false, destructiveActions: false },
    experimentalFeatures: {},
    artifactDirectory: Option.none(),
    security: 'auto',
  }),
  channel: 'stable',
  isDevModeEnabled: () => false,
  areDeveloperDangerousCommandsEnabled: () => false,
  isExperimentalFeatureEnabled: () => false,
  update: () => Effect.void,
});

const makeSink = () => {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return Object.assign(sink, { isTTY: false, chunks });
};

/**
 * What the install handler needs and nothing more: the real filesystem over a fresh home
 * directory, the running executable at `execPath`, the given environment, and a terminal
 * whose stderr is a pipe, so every report line is written plain and can be compared exactly.
 * Pass `ui` to swap the terminal out — e.g. for a recording UI that pins the decorated
 * (`canDecorate=true`) report channel.
 */
const installTest = (
  params: {
    readonly env?: Record<string, string>;
    readonly execPath?: string;
    readonly ui?: Layer.Layer<TerminalUI>;
  } = {}
) => {
  const home = tempy.temporaryDirectory({ prefix: 'install-handler' });
  const stderr = makeSink();
  const uiLayer =
    params.ui ??
    Layer.succeed(
      TerminalUI,
      makeTerminalUI({ stdin: { isTTY: false }, stdout: makeSink(), stderr })
    );
  const layer = Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir: home })),
    Layer.succeed(
      NodeProcess,
      NodeProcess.of({
        cwd: home,
        execPath: params.execPath ?? `${BIN_DIR}/composio`,
        platform: 'linux',
        arch: 'x64',
      })
    ),
    uiLayer,
    Layer.succeed(ComposioCliUserConfig, cliUserConfig),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PATH: '/usr/bin:/bin', ...params.env } }))
  );
  return {
    home,
    layer,
    /** Every stderr line written so far. */
    stderrLines: () => stderr.chunks.join('').split('\n').slice(0, -1),
  };
};

const readHomeFile = (home: string, file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(path.join(home, file));
  });

/**
 * A stderr-TTY terminal (`canDecorate=true`, the interactive default) that records where
 * `makeInstallReporter`'s decorated arm sends each report: status lines to `log.step`,
 * per-file confirmations to `log.success`, aborts to `log.error`, boxed hints to `note`,
 * and the plain `error` fallback never touched.
 */
const decoratedInstallUI = () => {
  const calls = {
    step: [] as string[],
    success: [] as string[],
    warn: [] as string[],
    error: [] as string[],
    note: [] as [message: string, title: string | undefined][],
    plainError: [] as string[],
  };
  const ui = TerminalUI.of({
    ...terminalUITestImpl,
    capabilities: Effect.succeed(
      getTerminalCapabilities({
        stdin: { isTTY: false },
        stdout: { isTTY: false },
        stderr: { isTTY: true },
      })
    ),
    error: data => Effect.sync(() => calls.plainError.push(data)),
    log: {
      ...terminalUITestImpl.log,
      success: message => Effect.sync(() => calls.success.push(message)),
      warn: message => Effect.sync(() => calls.warn.push(message)),
      error: message => Effect.sync(() => calls.error.push(message)),
      step: message => Effect.sync(() => calls.step.push(message)),
    },
    note: (message, title) => Effect.sync(() => calls.note.push([message, title])),
  });
  return { calls, layer: Layer.succeed(TerminalUI, ui) };
};

describe('installShellIntegration', () => {
  it.effect('zsh: writes ~/.zshrc and prints the restart hint', () => {
    const { home, layer, stderrLines } = installTest({ env: { SHELL: '/bin/zsh' } });
    return Effect.gen(function* () {
      yield* installShellIntegration({ completions: false });

      expect(stderrLines()).toEqual([
        'Detected shell: zsh',
        `PATH: will add ${BIN_DIR} to $PATH`,
        'Completions: skipped for zsh',
        'Updated ~/.zshrc',
        'Restart your shell to apply changes:',
        'source ~/.zshrc',
      ]);
      expect(yield* readHomeFile(home, '.zshrc')).toBe(
        `\n# Composio CLI\nexport PATH="${BIN_DIR}:$PATH"\n`
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('zsh: a second run reports the current block and writes nothing', () => {
    const { layer, stderrLines } = installTest({ env: { SHELL: '/bin/zsh' } });
    return Effect.gen(function* () {
      yield* installShellIntegration({ completions: false });
      const firstRun = stderrLines().length;
      yield* installShellIntegration({ completions: false });

      expect(stderrLines().slice(firstRun)).toEqual([
        'Detected shell: zsh',
        'PATH: already configured',
        'Completions: skipped for zsh',
        'Shell integration already configured — nothing to do.',
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    'bash with an existing ~/.profile: the created ~/.bash_profile sources it and is reported first',
    () => {
      const { home, layer, stderrLines } = installTest({ env: { SHELL: '/bin/bash' } });
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(path.join(home, '.profile'), 'export FOO=1\n');

        yield* installShellIntegration({ completions: false });

        expect(stderrLines()).toEqual([
          'Detected shell: bash',
          `PATH: will add ${BIN_DIR} to $PATH`,
          'Completions: skipped by default (pass --completions to enable)',
          'Updated ~/.bash_profile',
          'Updated ~/.bashrc',
          'Restart your shell to apply changes:',
          'source ~/.bashrc',
          '~/.bash_profile was also updated — that entry applies to new login shells too.',
        ]);
        expect(yield* readHomeFile(home, '.bash_profile')).toMatch(
          /^\n# Created by the Composio CLI installer\.\n[\s\S]*\nfi\n\n# Composio CLI\n/
        );
        expect(yield* readHomeFile(home, '.profile')).toBe('export FOO=1\n');
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('fish with completions: PATH and completions land in their own files', () => {
    const { home, layer, stderrLines } = installTest({ env: { SHELL: '/usr/bin/fish' } });
    return Effect.gen(function* () {
      yield* installShellIntegration({ completions: true });

      expect(stderrLines()).toEqual([
        'Detected shell: fish',
        `PATH: will add ${BIN_DIR} to $PATH`,
        'Completions: will install fish completions to ~/.config/fish/completions/composio.fish',
        'Updated ~/.config/fish/config.fish',
        'Updated ~/.config/fish/completions/composio.fish',
        'Restart your shell to apply changes:',
        'exec fish',
      ]);
      expect(yield* readHomeFile(home, '.config/fish/completions/composio.fish')).toMatch(
        /^\n# Composio CLI completions\n/
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('a stale managed block is replaced in place', () => {
    const { home, layer, stderrLines } = installTest({
      env: { SHELL: '/bin/zsh', COMPOSIO_BIN_DIR: '/custom/bin' },
    });
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(
        path.join(home, '.zshrc'),
        '# mine\n# Composio CLI\nexport PATH="/old/bin:$PATH"\n'
      );

      yield* installShellIntegration({ completions: false });

      expect(stderrLines().slice(0, 4)).toEqual([
        'Detected shell: zsh',
        'PATH: will update the managed block to /custom/bin',
        'Completions: skipped for zsh',
        'Updated ~/.zshrc',
      ]);
      expect(yield* readHomeFile(home, '.zshrc')).toBe(
        '# mine\n\n# Composio CLI\nexport PATH="/custom/bin:$PATH"\n'
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('the installer origin keeps the status lines and drops the restart hint', () => {
    const { layer, stderrLines } = installTest({
      env: { SHELL: '/bin/zsh', COMPOSIO_CLI_INVOCATION_ORIGIN: 'installer' },
    });
    return Effect.gen(function* () {
      yield* installShellIntegration({ completions: false });

      expect(stderrLines()).toEqual([
        'Detected shell: zsh',
        `PATH: will add ${BIN_DIR} to $PATH`,
        'Completions: skipped for zsh',
        'Updated ~/.zshrc',
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('no detectable shell prints the line to add by hand', () => {
    const { layer, stderrLines } = installTest({ env: { SHELL: '/bin/sh' } });
    return Effect.gen(function* () {
      yield* installShellIntegration({ completions: false });

      expect(stderrLines()).toEqual([
        'warning: Could not detect your shell. Manually add the following to your shell config:',
        'PATH setup:',
        `export PATH="${BIN_DIR}:$PATH"`,
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('no detectable shell with the bin dir on $PATH has nothing to update', () => {
    const { layer, stderrLines } = installTest({ env: { PATH: `/usr/bin:${BIN_DIR}` } });
    return Effect.gen(function* () {
      yield* installShellIntegration({ completions: false });

      expect(stderrLines()).toEqual([
        `PATH: ${BIN_DIR} is already on $PATH in this process, and no shell config file could be identified — nothing to update.`,
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    ['a relative bin dir', './bin', BIN_DIR_NOT_ABSOLUTE_MESSAGE],
    ['a bin dir with a PATH delimiter', '/a:/b', BIN_DIR_UNSAFE_MESSAGE],
    ['a bin dir that expands in double quotes', '/tmp/x$(evil)', BIN_DIR_UNSAFE_MESSAGE],
  ])('%s aborts with ShellSetupAbortError before touching any file', ([, binDir, message]) => {
    const { home, layer, stderrLines } = installTest({
      env: { SHELL: '/bin/zsh', COMPOSIO_BIN_DIR: binDir },
    });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(installShellIntegration({ completions: false }));

      expect(error).toEqual(new ShellSetupAbortError({ message }));
      expect(stderrLines()).toEqual([`error: ${message}`]);
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.exists(path.join(home, '.zshrc'))).toBe(false);
    }).pipe(Effect.provide(layer));
  });
});

describe('runInstall', () => {
  it.effect('--shell overrides $SHELL and --no-completions wins over --completions', () => {
    const { home, layer, stderrLines } = installTest({ env: { SHELL: '/bin/zsh' } });
    return Effect.gen(function* () {
      yield* runInstall({ completions: true, noCompletions: true, shell: Option.some('fish') });

      expect(stderrLines().slice(0, 3)).toEqual([
        'Detected shell: fish',
        `PATH: will add ${BIN_DIR} to $PATH`,
        'Completions: skipped by default (pass --completions to enable)',
      ]);
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.exists(path.join(home, '.zshrc'))).toBe(false);
    }).pipe(Effect.provide(layer));
  });

  it.effect('--completions without --no-completions installs them', () => {
    const { layer, stderrLines } = installTest({ env: { SHELL: '/bin/bash' } });
    return Effect.gen(function* () {
      yield* runInstall({ completions: true, noCompletions: false, shell: Option.none() });

      expect(stderrLines()[2]).toBe('Completions: will install shell completions');
    }).pipe(Effect.provide(layer));
  });
});

describe('decorated reporter (stderr TTY)', () => {
  it.effect(
    'zsh: reports route to the log/note channels with the same content and no plain prefixes',
    () => {
      const { calls, layer: ui } = decoratedInstallUI();
      const { home, layer, stderrLines } = installTest({ env: { SHELL: '/bin/zsh' }, ui });
      return Effect.gen(function* () {
        yield* installShellIntegration({ completions: false });

        expect(calls.step).toEqual([
          'Detected shell: zsh',
          `PATH: will add ${BIN_DIR} to $PATH`,
          'Completions: skipped for zsh',
        ]);
        expect(calls.success).toEqual(['Updated ~/.zshrc']);
        expect(calls.note).toEqual([['source ~/.zshrc', 'Restart your shell to apply changes']]);
        expect(calls.warn).toEqual([]);
        expect(calls.error).toEqual([]);
        expect(calls.plainError).toEqual([]);
        expect(stderrLines()).toEqual([]);
        expect(yield* readHomeFile(home, '.zshrc')).toBe(
          `\n# Composio CLI\nexport PATH="${BIN_DIR}:$PATH"\n`
        );
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('abort: the failure line routes to log.error without the error: prefix', () => {
    const { calls, layer: ui } = decoratedInstallUI();
    const { home, layer } = installTest({
      env: { SHELL: '/bin/zsh', COMPOSIO_BIN_DIR: '/tmp/x$(evil)' },
      ui,
    });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(installShellIntegration({ completions: false }));

      expect(error).toEqual(new ShellSetupAbortError({ message: BIN_DIR_UNSAFE_MESSAGE }));
      expect(calls.error).toEqual([BIN_DIR_UNSAFE_MESSAGE]);
      expect(calls.step).toEqual([]);
      expect(calls.success).toEqual([]);
      expect(calls.warn).toEqual([]);
      expect(calls.note).toEqual([]);
      expect(calls.plainError).toEqual([]);
      const fs = yield* FileSystem.FileSystem;
      expect(yield* fs.exists(path.join(home, '.zshrc'))).toBe(false);
    }).pipe(Effect.provide(layer));
  });
});
