import path from 'node:path';
import process from 'node:process';
import { beforeEach, afterEach } from 'vitest';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { FileSystem } from '@effect/platform';
import { NodeOs } from 'src/services/node-os';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio install', () => {
  let savedShell: string | undefined;
  let savedInstallDir: string | undefined;

  beforeEach(() => {
    savedShell = process.env.SHELL;
    savedInstallDir = process.env.COMPOSIO_INSTALL_DIR;
  });

  afterEach(() => {
    if (savedShell !== undefined) {
      process.env.SHELL = savedShell;
    } else {
      delete process.env.SHELL;
    }
    if (savedInstallDir !== undefined) {
      process.env.COMPOSIO_INSTALL_DIR = savedInstallDir;
    } else {
      delete process.env.COMPOSIO_INSTALL_DIR;
    }
  });

  describe('[When] shell is zsh', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] creates .zshrc with PATH only by default', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          process.env.SHELL = '/bin/zsh';
          process.env.COMPOSIO_INSTALL_DIR = path.join(os.homedir, '.composio');

          yield* cli(['install']);

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.zshrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).toContain('export COMPOSIO_INSTALL_DIR=');
          expect(contents).toContain('export PATH="$COMPOSIO_INSTALL_DIR:$PATH"');
          expect(contents).not.toContain('# Composio CLI completions');

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Detected shell: zsh');
          expect(output).toContain('PATH: will add');
          expect(output).toContain('Completions: skipped for zsh');
          expect(output).toContain('Updated');
          expect(output).toContain('source ~/.zshrc');
        })
      );
    });
  });

  describe('[When] shell is bash', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] creates .bashrc with PATH only by default', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          process.env.SHELL = '/bin/bash';
          process.env.COMPOSIO_INSTALL_DIR = path.join(os.homedir, '.composio');

          yield* cli(['install']);

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.bashrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).toContain('export COMPOSIO_INSTALL_DIR=');
          expect(contents).toContain('export PATH="$COMPOSIO_INSTALL_DIR:$PATH"');
          expect(contents).not.toContain('# Composio CLI completions');
        })
      );
    });
  });

  describe('[When] shell is fish', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] creates config.fish with PATH only by default', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          process.env.SHELL = '/usr/bin/fish';
          process.env.COMPOSIO_INSTALL_DIR = path.join(os.homedir, '.composio');

          yield* cli(['install']);

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.config', 'fish', 'config.fish');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).toContain('set --export COMPOSIO_INSTALL_DIR');
          expect(contents).toContain('set --export PATH $COMPOSIO_INSTALL_DIR $PATH');
          expect(contents).not.toContain('# Composio CLI completions');
        })
      );
    });
  });

  describe('[When] --completions is passed', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] writes PATH block and installs completions', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          process.env.SHELL = '/bin/bash';
          process.env.COMPOSIO_INSTALL_DIR = path.join(os.homedir, '.composio');

          yield* cli(['install', '--completions']);

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.bashrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).toContain('export COMPOSIO_INSTALL_DIR=');
          expect(contents).toContain('# Composio CLI completions');

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Completions: will install shell completions');
        })
      );
    });
  });

  describe('[When] --no-completions is passed', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] writes PATH block but skips completions', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          process.env.SHELL = '/bin/zsh';
          process.env.COMPOSIO_INSTALL_DIR = path.join(os.homedir, '.composio');

          yield* cli(['install', '--no-completions']);

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.zshrc');
          const contents = yield* fs.readFileString(rcPath);

          expect(contents).toContain('# Composio CLI');
          expect(contents).toContain('export COMPOSIO_INSTALL_DIR=');
          expect(contents).not.toContain('# Composio CLI completions');

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Completions: skipped for zsh');
        })
      );
    });
  });

  describe('[When] install is run twice (idempotency)', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] does not duplicate entries', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          process.env.SHELL = '/bin/bash';
          process.env.COMPOSIO_INSTALL_DIR = path.join(os.homedir, '.composio');

          // Run install twice
          yield* cli(['install', '--completions']);
          yield* cli(['install', '--completions']);

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

  describe('[When] .zshrc already has the marker', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] reports already configured', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          const fs = yield* FileSystem.FileSystem;
          process.env.SHELL = '/bin/zsh';
          process.env.COMPOSIO_INSTALL_DIR = path.join(os.homedir, '.composio');

          // Pre-populate .zshrc with existing config
          const rcPath = path.join(os.homedir, '.zshrc');
          yield* fs.writeFileString(
            rcPath,
            '# existing config\n# Composio CLI\nexport COMPOSIO_INSTALL_DIR=/old\n# Composio CLI completions\n_composio() {}\n'
          );

          yield* cli(['install', '--completions']);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('PATH: already configured');
          expect(output).toContain('Completions: skipped for zsh');
          expect(output).toContain('Shell integration already configured');

          // File should not have grown
          const contents = yield* fs.readFileString(rcPath);
          const markerCount = contents.split('# Composio CLI').length - 1;
          expect(markerCount).toBe(2);
        })
      );
    });
  });

  describe('[When] shell cannot be detected', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] shows manual setup instructions', () =>
        Effect.gen(function* () {
          process.env.SHELL = '';

          yield* cli(['install']);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('Could not detect your shell');
          expect(output).toContain('export COMPOSIO_INSTALL_DIR=');
          expect(output).toContain('Manual setup required.');
        })
      );
    });
  });

  describe('[When] COMPOSIO_INSTALL_DIR is not set', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] defaults to ~/.composio', () =>
        Effect.gen(function* () {
          const os = yield* NodeOs;
          process.env.SHELL = '/bin/zsh';
          delete process.env.COMPOSIO_INSTALL_DIR;

          yield* cli(['install']);

          const fs = yield* FileSystem.FileSystem;
          const rcPath = path.join(os.homedir, '.zshrc');
          const contents = yield* fs.readFileString(rcPath);

          // Should use ~/.composio as the default install directory (quoted)
          expect(contents).toContain(
            `export COMPOSIO_INSTALL_DIR="${path.join(os.homedir, '.composio')}"`
          );
        })
      );
    });
  });

  describe('[When] COMPOSIO_INSTALL_DIR contains shell metacharacters', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] aborts with an error', () =>
        Effect.gen(function* () {
          process.env.SHELL = '/bin/zsh';
          process.env.COMPOSIO_INSTALL_DIR = '/tmp/x; curl evil.com';

          yield* cli(['install']);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('unsafe characters');
          expect(output).toContain('Aborted');
        })
      );
    });
  });
});
