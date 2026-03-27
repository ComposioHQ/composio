import path from 'node:path';
import process from 'node:process';
import { Command, Options } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Array as Arr, Effect } from 'effect';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { getCompletionScript } from 'src/effects/shell-completions';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const noCompletionsOpt = Options.boolean('no-completions').pipe(
  Options.withDescription('Skip shell completions setup.'),
  Options.withDefault(false)
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Shell = 'bash' | 'zsh' | 'fish';

interface ShellConfig {
  readonly shell: Shell;
  readonly rcFile: string;
  readonly pathBlock: string;
  readonly completionBlock: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MARKER = '# Composio CLI';
const COMPLETIONS_MARKER = '# Composio CLI completions';

/** Reject install directory paths containing shell metacharacters to prevent injection into rc files. */
const UNSAFE_PATH_CHARS = /[;`$|&"'()\n\r\\]/;
const isUnsafePath = (p: string): boolean => UNSAFE_PATH_CHARS.test(p);

const detectShell = (): Shell | undefined => {
  const shellEnv = process.env.SHELL ?? '';
  const base = path.basename(shellEnv);
  if (base === 'zsh') return 'zsh';
  if (base === 'bash') return 'bash';
  if (base === 'fish') return 'fish';
  return undefined;
};

/**
 * Return candidate rc file paths for a shell, ordered by preference.
 * For bash this mirrors the install.sh fallback: .bashrc then .bash_profile.
 */
const rcFileCandidates = (shell: Shell, homedir: string): string[] => {
  switch (shell) {
    case 'zsh':
      return [path.join(homedir, '.zshrc')];
    case 'bash':
      return [path.join(homedir, '.bashrc'), path.join(homedir, '.bash_profile')];
    case 'fish':
      return [path.join(homedir, '.config', 'fish', 'config.fish')];
  }
};

/**
 * Pick the first existing candidate, or fall back to the first candidate
 * (which will be created).
 */
const resolveRcFile = (
  candidates: string[],
  fs: FileSystem.FileSystem
): Effect.Effect<string, PlatformError> =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      const exists = yield* fs.exists(candidate);
      if (exists) return candidate;
    }
    return candidates[0]!;
  });

const pathBlockForShell = (shell: Shell, installDir: string): string => {
  switch (shell) {
    case 'fish':
      return [
        MARKER,
        `set --export COMPOSIO_INSTALL_DIR "${installDir}"`,
        `set --export PATH $COMPOSIO_INSTALL_DIR $PATH`,
      ].join('\n');
    default:
      return [
        MARKER,
        `export COMPOSIO_INSTALL_DIR="${installDir}"`,
        `export PATH="$COMPOSIO_INSTALL_DIR:$PATH"`,
      ].join('\n');
  }
};

const buildShellConfig = (
  shell: Shell,
  rcFile: string,
  installDir: string,
  completionScript: string | undefined
): ShellConfig => ({
  shell,
  rcFile,
  pathBlock: pathBlockForShell(shell, installDir),
  completionBlock: completionScript ? `${COMPLETIONS_MARKER}\n${completionScript}` : undefined,
});

/** Check whether a file already contains a given marker line. */
const fileContains = (contents: string, marker: string): boolean =>
  contents.split('\n').some(line => line.trim() === marker.trim());

const tildify = (p: string, homedir: string): string =>
  p.startsWith(homedir + '/') ? `~/${p.slice(homedir.length + 1)}` : p;

// ---------------------------------------------------------------------------
// Exported logic (reusable from install.sh post-install delegation)
// ---------------------------------------------------------------------------

export const installShellIntegration = (params: {
  readonly noCompletions: boolean;
}): Effect.Effect<void, PlatformError, TerminalUI | NodeOs | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const os = yield* NodeOs;
    const fs = yield* FileSystem.FileSystem;

    yield* ui.intro('composio install');

    // Detect install directory — either from env or default ~/.composio
    const installDir = process.env.COMPOSIO_INSTALL_DIR ?? path.join(os.homedir, '.composio');

    if (isUnsafePath(installDir)) {
      yield* ui.log.error(
        'COMPOSIO_INSTALL_DIR contains unsafe characters and cannot be written to shell config.'
      );
      yield* ui.outro('Aborted.');
      return;
    }

    // Detect user shell
    const shell = detectShell();
    if (!shell) {
      yield* ui.log.warn(
        'Could not detect your shell. Manually add the following to your shell config:'
      );
      yield* ui.note(
        `export COMPOSIO_INSTALL_DIR="${installDir}"\nexport PATH="$COMPOSIO_INSTALL_DIR:$PATH"`,
        'PATH setup'
      );
      yield* ui.outro('Manual setup required.');
      return;
    }

    yield* ui.log.step(`Detected shell: ${shell}`);

    // Generate completions script if requested.
    // Lazy-import the root command to avoid a circular dependency
    // (index.ts → install.cmd.ts → index.ts).
    let completionScript: string | undefined;
    if (!params.noCompletions && shell !== 'zsh') {
      const mod = yield* Effect.promise(() => import('src/commands'));
      const lines = yield* getCompletionScript(mod.rootCommand, shell);
      completionScript = lines.length > 0 ? Arr.join(lines, '\n') : undefined;
    }

    const rcFile = yield* resolveRcFile(rcFileCandidates(shell, os.homedir), fs);
    const config = buildShellConfig(shell, rcFile, installDir, completionScript);

    // Read existing rc file (or empty if it doesn't exist yet)
    const rcPath = config.rcFile;
    const existing = yield* fs
      .readFileString(rcPath)
      .pipe(
        Effect.catchAll(e =>
          Effect.logDebug('RC file does not exist yet, will create:', e).pipe(Effect.as(''))
        )
      );

    // Build blocks to append (idempotently)
    const blocks: string[] = [];

    if (!fileContains(existing, MARKER)) {
      blocks.push(config.pathBlock);
      yield* ui.log.step(`PATH: will add ${tildify(installDir, os.homedir)} to $PATH`);
    } else {
      yield* ui.log.step('PATH: already configured');
    }

    if (shell === 'zsh') {
      yield* ui.log.step('Completions: skipped for zsh');
    } else if (config.completionBlock && !fileContains(existing, COMPLETIONS_MARKER)) {
      blocks.push(config.completionBlock);
      yield* ui.log.step('Completions: will install shell completions');
    } else if (params.noCompletions) {
      yield* ui.log.step('Completions: skipped (--no-completions)');
    } else if (!config.completionBlock) {
      yield* ui.log.step('Completions: not available for this shell');
    } else {
      yield* ui.log.step('Completions: already configured');
    }

    if (blocks.length > 0) {
      // Ensure parent directory exists (for fish config)
      yield* fs
        .makeDirectory(path.dirname(rcPath), { recursive: true })
        .pipe(
          Effect.catchAll(e =>
            Effect.logDebug('Could not create parent directory (may already exist):', e)
          )
        );

      const appendContent = '\n' + blocks.join('\n\n') + '\n';

      // Atomic write: write to a temp file then rename, so a crash mid-write
      // cannot leave the user's rc file truncated/corrupted.
      const tmpPath = `${rcPath}.composio-tmp`;
      yield* fs.writeFileString(tmpPath, existing + appendContent);
      yield* fs.rename(tmpPath, rcPath);

      yield* ui.log.success(`Updated ${tildify(rcPath, os.homedir)}`);
      yield* ui.note(
        shell === 'fish' || shell === 'zsh' ? `source ${tildify(rcPath, os.homedir)}` : 'exec $SHELL',
        'Restart your shell to apply changes'
      );
    } else {
      yield* ui.log.success('Shell integration already configured — nothing to do.');
    }

    yield* ui.outro('Done');
  });

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * CLI command to set up shell integration (PATH and completions).
 *
 * @example
 * ```bash
 * composio install
 * composio install --no-completions
 * ```
 */
export const installCmd = Command.make(
  'install',
  { noCompletions: noCompletionsOpt },
  ({ noCompletions }) => installShellIntegration({ noCompletions })
).pipe(Command.withDescription('Set up shell integration (PATH and completions).'));
