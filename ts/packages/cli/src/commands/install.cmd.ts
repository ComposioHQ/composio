import path from 'node:path';
import process from 'node:process';
import { Command, Options } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Array as Arr, Effect } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import { TerminalUI } from 'src/services/terminal-ui';
import { getCompletionScript } from 'src/effects/shell-completions';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const completionsOpt = Options.boolean('completions').pipe(
  Options.withDescription('Install shell completions.'),
  Options.withDefault(false)
);

const noCompletionsOpt = Options.boolean('no-completions').pipe(
  Options.withDescription('Deprecated: shell completions are skipped by default.'),
  Options.withDefault(false)
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Shell = 'bash' | 'zsh' | 'fish';

interface ShellConfig {
  readonly shell: Shell;
  readonly rcFile: string;
  /** File where completions are written. For fish this is a dedicated file; for others it matches rcFile. */
  readonly completionFile: string;
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

/**
 * Return the file path where completions should be written.
 * Fish uses a dedicated completions directory; bash appends to the rc file.
 */
const completionFileForShell = (shell: Shell, rcFile: string, homedir: string): string => {
  if (shell === 'fish') {
    return path.join(homedir, '.config', 'fish', 'completions', 'composio.fish');
  }
  return rcFile;
};

const buildShellConfig = (
  shell: Shell,
  rcFile: string,
  homedir: string,
  installDir: string,
  completionScript: string | undefined
): ShellConfig => ({
  shell,
  rcFile,
  completionFile: completionFileForShell(shell, rcFile, homedir),
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
  readonly completions: boolean;
}): Effect.Effect<
  void,
  PlatformError,
  TerminalUI | NodeOs | FileSystem.FileSystem | ComposioCliUserConfig
> =>
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
    if (params.completions && shell !== 'zsh') {
      const cliUserConfig = yield* ComposioCliUserConfig;
      const mod = yield* Effect.promise(() => import('src/commands'));
      const lines = yield* getCompletionScript(
        mod.buildRootCommand({
          isExperimentalFeatureEnabled: feature =>
            cliUserConfig.isExperimentalFeatureEnabled(feature),
        }),
        shell
      );
      completionScript = lines.length > 0 ? Arr.join(lines, '\n') : undefined;
    }

    const rcFile = yield* resolveRcFile(rcFileCandidates(shell, os.homedir), fs);
    const config = buildShellConfig(shell, rcFile, os.homedir, installDir, completionScript);

    // Read existing rc file (or empty if it doesn't exist yet)
    const rcPath = config.rcFile;
    const existing = yield* fs
      .readFileString(rcPath)
      .pipe(
        Effect.catchAll(e =>
          Effect.logDebug('RC file does not exist yet, will create:', e).pipe(Effect.as(''))
        )
      );

    // For fish, completions go to a separate file; for others they share the rc file.
    const completionPath = config.completionFile;
    const usesSeparateCompletionFile = completionPath !== rcPath;
    const existingCompletionFile = usesSeparateCompletionFile
      ? yield* fs
          .readFileString(completionPath)
          .pipe(
            Effect.catchAll(e =>
              Effect.logDebug('Completion file does not exist yet, will create:', e).pipe(
                Effect.as('')
              )
            )
          )
      : existing;

    // Build blocks to append to rc file (idempotently)
    const rcBlocks: string[] = [];
    let writeCompletionFile = false;

    if (!fileContains(existing, MARKER)) {
      rcBlocks.push(config.pathBlock);
      yield* ui.log.step(`PATH: will add ${tildify(installDir, os.homedir)} to $PATH`);
    } else {
      yield* ui.log.step('PATH: already configured');
    }

    if (shell === 'zsh') {
      yield* ui.log.step('Completions: skipped for zsh');
    } else if (!params.completions) {
      yield* ui.log.step('Completions: skipped by default (pass --completions to enable)');
    } else if (
      config.completionBlock &&
      !fileContains(existingCompletionFile, COMPLETIONS_MARKER)
    ) {
      if (usesSeparateCompletionFile) {
        writeCompletionFile = true;
      } else {
        rcBlocks.push(config.completionBlock);
      }
      yield* ui.log.step('Completions: will install shell completions');
    } else if (!config.completionBlock) {
      yield* ui.log.step('Completions: not available for this shell');
    } else {
      yield* ui.log.step('Completions: already configured');
    }

    const hasRcChanges = rcBlocks.length > 0;
    const hasCompletionChanges = writeCompletionFile && config.completionBlock;

    if (hasRcChanges || hasCompletionChanges) {
      if (hasRcChanges) {
        // Ensure parent directory exists (for fish config)
        yield* fs
          .makeDirectory(path.dirname(rcPath), { recursive: true })
          .pipe(
            Effect.catchAll(e =>
              Effect.logDebug('Could not create parent directory (may already exist):', e)
            )
          );

        const appendContent = '\n' + rcBlocks.join('\n\n') + '\n';

        // Atomic write: write to a temp file then rename, so a crash mid-write
        // cannot leave the user's rc file truncated/corrupted.
        const tmpPath = `${rcPath}.composio-tmp`;
        yield* fs.writeFileString(tmpPath, existing + appendContent);
        yield* fs.rename(tmpPath, rcPath);

        yield* ui.log.success(`Updated ${tildify(rcPath, os.homedir)}`);
      }

      if (hasCompletionChanges) {
        // Write completions to a dedicated file (e.g. ~/.config/fish/completions/composio.fish)
        yield* fs
          .makeDirectory(path.dirname(completionPath), { recursive: true })
          .pipe(
            Effect.catchAll(e =>
              Effect.logDebug('Could not create completions directory (may already exist):', e)
            )
          );

        const tmpPath = `${completionPath}.composio-tmp`;
        yield* fs.writeFileString(tmpPath, config.completionBlock! + '\n');
        yield* fs.rename(tmpPath, completionPath);

        yield* ui.log.success(`Updated ${tildify(completionPath, os.homedir)}`);
      }

      yield* ui.note(
        shell === 'fish' || shell === 'zsh'
          ? `source ${tildify(rcPath, os.homedir)}`
          : 'exec $SHELL',
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
 * composio install --completions
 * composio install --no-completions
 * ```
 */
export const installCmd = Command.make(
  'install',
  { completions: completionsOpt, noCompletions: noCompletionsOpt },
  ({ completions, noCompletions }) =>
    installShellIntegration({ completions: completions && !noCompletions })
).pipe(Command.withDescription('Set up shell integration (PATH and completions).'));
