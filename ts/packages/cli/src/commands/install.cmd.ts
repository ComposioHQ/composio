import process from 'node:process';
import { Command, Options } from '@effect/cli';
import { FileSystem, Path } from '@effect/platform';
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
  readonly pathFile: string;
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

const detectShell = (path: Path.Path): Shell | undefined => {
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- $SHELL is read inside a plain synchronous helper that mirrors install.sh's shell detection, outside any Effect context
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
const rcFileCandidates = (path: Path.Path, shell: Shell, homedir: string): string[] => {
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
  path: Path.Path,
  shell: Shell,
  rcFile: string,
  installDir: string,
  completionScript: string | undefined,
  homedir: string
): ShellConfig => ({
  shell,
  pathFile: rcFile,
  completionFile:
    shell === 'fish'
      ? path.join(homedir, '.config', 'fish', 'completions', 'composio.fish')
      : rcFile,
  pathBlock: pathBlockForShell(shell, installDir),
  completionBlock: completionScript ? `${COMPLETIONS_MARKER}\n${completionScript}` : undefined,
});

/** Check whether a file already contains a given marker line. */
const fileContains = (contents: string, marker: string): boolean =>
  contents.split('\n').some(line => line.trim() === marker.trim());

const tildify = (p: string, homedir: string): string =>
  p.startsWith(homedir + '/') ? `~/${p.slice(homedir.length + 1)}` : p;

const readMaybeMissingFile = (
  filePath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<string, PlatformError> =>
  fs
    .readFileString(filePath)
    .pipe(
      Effect.catchAll(e =>
        Effect.logDebug('File does not exist yet, will create:', e).pipe(Effect.as(''))
      )
    );

/** Resolve valid symlink chains so atomic writes update the target instead of replacing the link. */
const resolveWriteTarget = (
  filePath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<string, PlatformError> =>
  fs.readLink(filePath).pipe(
    Effect.flatMap(() => fs.realPath(filePath)),
    Effect.catchAll(() => Effect.succeed(filePath))
  );

// ---------------------------------------------------------------------------
// Exported logic (reusable from install.sh post-install delegation)
// ---------------------------------------------------------------------------

export const installShellIntegration = (params: {
  readonly completions: boolean;
}): Effect.Effect<
  void,
  PlatformError,
  TerminalUI | NodeOs | FileSystem.FileSystem | Path.Path | ComposioCliUserConfig
> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const os = yield* NodeOs;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Everything this command prints is a report of what it changed on disk, so
    // it has to reach the user even when stderr is not a terminal: install.sh
    // runs it as a subprocess, and container/CI installs pipe the whole session
    // to a build log. Decoration stays the interactive default; `ui.error`
    // writes the same text unformatted when there is nothing to decorate.
    const { canDecorate } = yield* ui.capabilities;
    const step = (message: string) => (canDecorate ? ui.log.step(message) : ui.error(message));
    const success = (message: string) =>
      canDecorate ? ui.log.success(message) : ui.error(message);
    const warn = (message: string) =>
      canDecorate ? ui.log.warn(message) : ui.error(`warning: ${message}`);
    const failure = (message: string) =>
      canDecorate ? ui.log.error(message) : ui.error(`error: ${message}`);
    const note = (body: string, title: string) =>
      canDecorate ? ui.note(body, title) : ui.error(`${title}:\n${body}`);

    yield* ui.intro('composio install');

    // Detect install directory — either from env or default ~/.composio
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- COMPOSIO_INSTALL_DIR is the handoff variable set by the install.sh bootstrapper for this one-shot post-install step; read directly to stay byte-compatible with the script
    const installDir = process.env.COMPOSIO_INSTALL_DIR ?? path.join(os.homedir, '.composio');

    if (isUnsafePath(installDir)) {
      yield* failure(
        'COMPOSIO_INSTALL_DIR contains unsafe characters and cannot be written to shell config.'
      );
      yield* ui.outro('Aborted.');
      return;
    }

    // Detect user shell
    const shell = detectShell(path);
    if (!shell) {
      yield* warn('Could not detect your shell. Manually add the following to your shell config:');
      yield* note(
        `export COMPOSIO_INSTALL_DIR="${installDir}"\nexport PATH="$COMPOSIO_INSTALL_DIR:$PATH"`,
        'PATH setup'
      );
      yield* ui.outro('Manual setup required.');
      return;
    }

    yield* step(`Detected shell: ${shell}`);

    // Generate completions script if requested.
    // Lazy-import the root command to avoid a circular dependency
    // (index.ts → install.cmd.ts → index.ts).
    let completionScript: string | undefined;
    if (params.completions && shell !== 'zsh') {
      const cliUserConfig = yield* ComposioCliUserConfig;
      const mod = yield* Effect.promise(() => import('src/commands'));
      const lines = yield* getCompletionScript(
        mod.buildRootCommand({
          isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
          isExperimentalFeatureEnabled: feature =>
            cliUserConfig.isExperimentalFeatureEnabled(feature),
        }),
        shell
      );
      completionScript = lines.length > 0 ? Arr.join(lines, '\n') : undefined;
    }

    const rcFile = yield* resolveRcFile(rcFileCandidates(path, shell, os.homedir), fs);
    const config = buildShellConfig(path, shell, rcFile, installDir, completionScript, os.homedir);

    const uniqueTargetFiles = [...new Set([config.pathFile, config.completionFile])];
    const existingByFile = new Map<string, string>();
    for (const filePath of uniqueTargetFiles) {
      existingByFile.set(filePath, yield* readMaybeMissingFile(filePath, fs));
    }

    const blocksByFile = new Map<string, Array<string>>();
    const pushBlock = (filePath: string, block: string) => {
      const blocks = blocksByFile.get(filePath);
      if (blocks) {
        blocks.push(block);
      } else {
        blocksByFile.set(filePath, [block]);
      }
    };

    const existingPathFile = existingByFile.get(config.pathFile) ?? '';
    if (!fileContains(existingPathFile, MARKER)) {
      pushBlock(config.pathFile, config.pathBlock);
      yield* step(`PATH: will add ${tildify(installDir, os.homedir)} to $PATH`);
    } else {
      yield* step('PATH: already configured');
    }

    if (shell === 'zsh') {
      yield* step('Completions: skipped for zsh');
    } else if (!params.completions) {
      yield* step('Completions: skipped by default (pass --completions to enable)');
    } else if (!config.completionBlock) {
      yield* step('Completions: not available for this shell');
    } else {
      const existingCompletionFile = existingByFile.get(config.completionFile) ?? '';
      if (!fileContains(existingCompletionFile, COMPLETIONS_MARKER)) {
        pushBlock(config.completionFile, config.completionBlock);
        yield* step(
          config.shell === 'fish'
            ? `Completions: will install fish completions to ${tildify(config.completionFile, os.homedir)}`
            : 'Completions: will install shell completions'
        );
      } else {
        yield* step('Completions: already configured');
      }
    }

    if (blocksByFile.size > 0) {
      for (const [filePath, blocks] of blocksByFile.entries()) {
        // Re-read instead of reusing the pre-check snapshot: two configured paths
        // can alias the same physical file through symlinks, and this write must
        // not discard a previous iteration's append.
        const existingContents = yield* readMaybeMissingFile(filePath, fs);
        const writeTarget = yield* resolveWriteTarget(filePath, fs);

        yield* fs
          .makeDirectory(path.dirname(writeTarget), { recursive: true })
          .pipe(
            Effect.catchAll(e =>
              Effect.logDebug('Could not create parent directory (may already exist):', e)
            )
          );

        const appendContent = '\n' + blocks.join('\n\n') + '\n';
        const tmpPath = `${writeTarget}.composio-tmp`;

        yield* fs.writeFileString(tmpPath, existingContents + appendContent);
        yield* fs.rename(tmpPath, writeTarget);

        yield* success(`Updated ${tildify(filePath, os.homedir)}`);
      }
    } else {
      yield* success('Shell integration already configured — nothing to do.');
    }

    if (blocksByFile.size > 0) {
      yield* note(
        shell === 'fish'
          ? 'exec fish'
          : shell === 'zsh'
            ? `source ${tildify(rcFile, os.homedir)}`
            : 'exec $SHELL',
        'Restart your shell to apply changes'
      );
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
