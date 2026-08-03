import { Command, Options } from '@effect/cli';
import { FileSystem, Path } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Array as Arr, Config, ConfigProvider, Effect, Option } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
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

const SHELLS = ['zsh', 'bash', 'fish'] as const;

const shellOpt = Options.choice('shell', SHELLS).pipe(
  Options.withDescription('Override automatic shell detection.'),
  Options.optional
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Shell = (typeof SHELLS)[number];

interface ShellConfig {
  readonly shell: Shell;
  readonly pathFiles: readonly string[];
  readonly completionFile: string;
  readonly pathBlock: string;
  readonly completionBlock: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MARKER = '# Composio CLI';
const COMPLETIONS_MARKER = '# Composio CLI completions';

/** Reject bin-dir paths containing shell metacharacters to prevent injection into rc files. */
const UNSAFE_PATH_CHARS = /[:;`$|&"'()\n\r\\]/;
const isUnsafePath = (p: string): boolean => UNSAFE_PATH_CHARS.test(p);

// SHELL, PATH, and COMPOSIO_BIN_DIR are read from the literal environment: SHELL
// and PATH are POSIX-standard (no app prefix applies to them), and COMPOSIO_BIN_DIR
// is already the full env var name, not a suffix the app's `COMPOSIO_`-prefixing
// ambient config provider should prefix again. Read them from a raw provider
// instead (precedent: `src/analytics/dispatch.ts`'s `environmentProvider`).
const environmentProvider = ConfigProvider.fromEnv();

/** Read an optional env var from the raw environment; provider errors die rather than fail the command. */
const readOptionalEnv = (name: string): Effect.Effect<string | undefined> =>
  Effect.orDie(
    environmentProvider.load(
      Config.option(Config.string(name)).pipe(Config.map(Option.getOrUndefined))
    )
  );

/** Read an env var from the raw environment, falling back when unset. */
const readEnvWithDefault = (name: string, fallback: string): Effect.Effect<string> =>
  Effect.orDie(environmentProvider.load(Config.string(name).pipe(Config.withDefault(fallback))));

const detectShellFromEnv = (path: Path.Path, shellEnv: string): Shell | undefined => {
  const base = path.basename(shellEnv);
  if (base === 'zsh') return 'zsh';
  if (base === 'bash') return 'bash';
  if (base === 'fish') return 'fish';
  return undefined;
};

const isDirOnPath = (pathEnv: string, dir: string): boolean =>
  pathEnv.split(':').some(entry => entry === dir);

/**
 * True when `candidate` resolves (following symlinks) to the running
 * executable. A bare exists-check is not enough for bin-dir resolution: a
 * leftover `composio` from another installer (e.g. pip) would win, and the
 * PATH line would point shells at the wrong program.
 */
const resolvesToCurrentExecutable = (
  candidate: string,
  execPath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<boolean> =>
  Effect.zipWith(
    fs.realPath(candidate),
    fs.realPath(execPath).pipe(Effect.orElseSucceed(() => execPath)),
    (candidateReal, execReal) => candidateReal === execReal
  ).pipe(Effect.orElseSucceed(() => false));

/**
 * Bin-dir resolution order: explicit env, then `~/.local/bin` when its
 * `composio` entry point is the running executable, then the real binary's
 * own directory.
 */
const resolveBinDir = (params: {
  readonly envBinDir: string | undefined;
  readonly localBinDir: string;
  readonly localBinComposioIsCurrentExecutable: boolean;
  readonly execPath: string;
  readonly path: Path.Path;
}): string => {
  const trimmedEnvBinDir = params.envBinDir?.trim();
  if (trimmedEnvBinDir && trimmedEnvBinDir.length > 0) {
    return trimmedEnvBinDir;
  }
  if (params.localBinComposioIsCurrentExecutable) {
    return params.localBinDir;
  }
  return params.path.dirname(params.execPath);
};

/**
 * Render a path for embedding in a shell rc file. `~` never expands inside
 * double quotes, so home-relative paths use a literal `$HOME` prefix instead.
 */
const renderWithHome = (dir: string, homedir: string): string =>
  dir === homedir
    ? '$HOME'
    : dir.startsWith(`${homedir}/`)
      ? `$HOME/${dir.slice(homedir.length + 1)}`
      : dir;

const pathBlockForShell = (shell: Shell, binDir: string, homedir: string): string => {
  const rendered = renderWithHome(binDir, homedir);
  return shell === 'fish'
    ? [MARKER, `set --export PATH "${rendered}" $PATH`].join('\n')
    : [MARKER, `export PATH="${rendered}:$PATH"`].join('\n');
};

/** Bash startup-file candidates that only bash's login mode reads, in read order. */
const bashLoginOverrideCandidates = (path: Path.Path, homedir: string): string[] => [
  path.join(homedir, '.bash_profile'),
  path.join(homedir, '.bash_login'),
];

/**
 * First existing bash login-override file, if any. `bash -ilc` reads only the
 * first of `.bash_profile`, `.bash_login`, `.profile` that exists — so an
 * existing override shadows `.profile` and common `.profile` files source
 * `.bashrc`, unless the PATH line also lands in the override. `.profile` is
 * deliberately not a candidate below: when neither override exists, bash reads
 * `.profile` itself, and common `.profile` files already source `.bashrc`, so
 * nothing needs to be written to it.
 */
const resolveBashLoginOverride = (
  candidates: readonly string[],
  fs: FileSystem.FileSystem
): Effect.Effect<string | undefined, PlatformError> =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      if (yield* fs.exists(candidate)) return candidate;
    }
    return undefined;
  });

const pathFilesForShell = (
  path: Path.Path,
  shell: Shell,
  homedir: string,
  bashLoginOverride: string | undefined
): string[] => {
  switch (shell) {
    case 'zsh':
      return [path.join(homedir, '.zshrc')];
    case 'fish':
      return [path.join(homedir, '.config', 'fish', 'config.fish')];
    case 'bash': {
      const bashrc = path.join(homedir, '.bashrc');
      return bashLoginOverride ? [bashrc, bashLoginOverride] : [bashrc];
    }
  }
};

const buildShellConfig = (
  path: Path.Path,
  shell: Shell,
  pathFiles: readonly string[],
  binDir: string,
  completionScript: string | undefined,
  homedir: string
): ShellConfig => ({
  shell,
  pathFiles,
  completionFile:
    shell === 'fish'
      ? path.join(homedir, '.config', 'fish', 'completions', 'composio.fish')
      : pathFiles[0]!,
  pathBlock: pathBlockForShell(shell, binDir, homedir),
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

/**
 * Atomically replace `writeTarget` via a same-directory tmp file. The tmp copy
 * is created with the target's mode from the start so a private rc's contents
 * never sit in a default-mode, world-readable tmp file. open(2) masks the
 * requested mode with the process umask (only ever clearing bits), so a chmod
 * still follows to pin the exact mode.
 */
const replaceFilePreservingMode = (
  writeTarget: string,
  contents: string,
  fs: FileSystem.FileSystem
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    const existingTargetInfo = yield* fs.stat(writeTarget).pipe(Effect.option);
    const preservedMode = Option.map(existingTargetInfo, info => info.mode & 0o7777);
    const tmpPath = `${writeTarget}.composio-tmp`;
    yield* Option.match(preservedMode, {
      onNone: () => fs.writeFileString(tmpPath, contents),
      onSome: mode => fs.writeFileString(tmpPath, contents, { mode }),
    });
    if (Option.isSome(preservedMode)) {
      yield* fs.chmod(tmpPath, preservedMode.value);
    }
    yield* fs.rename(tmpPath, writeTarget);
  });

// ---------------------------------------------------------------------------
// Exported logic (reusable from install.sh post-install delegation)
// ---------------------------------------------------------------------------

export const installShellIntegration = (params: {
  readonly completions: boolean;
  readonly execPath?: string;
  readonly shell?: Shell;
}): Effect.Effect<
  void,
  PlatformError,
  TerminalUI | NodeOs | NodeProcess | FileSystem.FileSystem | Path.Path | ComposioCliUserConfig
> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const os = yield* NodeOs;
    const nodeProcess = yield* NodeProcess;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Everything this command prints is a report of what it changed on disk, so
    // it has to reach the user even when stderr is not a terminal: install.sh
    // runs it as a subprocess, and container/CI installs pipe the whole session
    // to a build log. Decoration stays the interactive default; `ui.error`
    // writes the same text unformatted when there is nothing to decorate.
    const { canDecorate } = yield* ui.capabilities;
    const plain = (prefix: string) => (message: string) => ui.error(`${prefix}${message}`);
    const step = canDecorate ? ui.log.step : ui.error;
    const success = canDecorate ? ui.log.success : ui.error;
    const warn = canDecorate ? ui.log.warn : plain('warning: ');
    const failure = canDecorate ? ui.log.error : plain('error: ');
    const note = (body: string, title: string) =>
      canDecorate ? ui.note(body, title) : ui.error(`${title}:\n${body}`);

    yield* ui.intro('composio install');

    // Resolve the entry-point bin dir: explicit env, then a ~/.local/bin/composio
    // that is this executable, then the runtime executable's own directory.
    const envBinDir = yield* readOptionalEnv('COMPOSIO_BIN_DIR');
    const localBinDir = path.join(os.homedir, '.local', 'bin');
    const execPath = params.execPath ?? nodeProcess.execPath;
    const localBinComposioIsCurrentExecutable = yield* resolvesToCurrentExecutable(
      path.join(localBinDir, 'composio'),
      execPath,
      fs
    );
    const binDir = path.normalize(
      resolveBinDir({
        envBinDir,
        localBinDir,
        localBinComposioIsCurrentExecutable,
        execPath,
        path,
      })
    );

    if (!path.isAbsolute(binDir)) {
      yield* failure('Resolved bin directory must be an absolute path.');
      yield* ui.outro('Aborted.');
      return;
    }

    if (isUnsafePath(binDir)) {
      yield* failure(
        'Resolved bin directory contains unsafe characters and cannot be written to shell config.'
      );
      yield* ui.outro('Aborted.');
      return;
    }

    const isExplicitShell = params.shell !== undefined;
    const shellEnv = yield* readEnvWithDefault('SHELL', '');
    const shell = params.shell ?? detectShellFromEnv(path, shellEnv);

    const pathEnv = yield* readEnvWithDefault('PATH', '');
    const binDirOnPath = isDirOnPath(pathEnv, binDir);

    if (!shell) {
      if (binDirOnPath) {
        yield* success(`PATH: ${tildify(binDir, os.homedir)} is already on $PATH — nothing to do.`);
        yield* ui.outro('Done');
        return;
      }
      yield* warn('Could not detect your shell. Manually add the following to your shell config:');
      yield* note(`export PATH="${renderWithHome(binDir, os.homedir)}:$PATH"`, 'PATH setup');
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

    const bashLoginOverride =
      shell === 'bash'
        ? yield* resolveBashLoginOverride(bashLoginOverrideCandidates(path, os.homedir), fs)
        : undefined;
    const pathFiles = pathFilesForShell(path, shell, os.homedir, bashLoginOverride);
    const config = buildShellConfig(path, shell, pathFiles, binDir, completionScript, os.homedir);

    const uniqueTargetFiles = [...new Set([...config.pathFiles, config.completionFile])];
    const existingByFile = new Map<string, string>();
    for (const filePath of uniqueTargetFiles) {
      existingByFile.set(filePath, yield* readMaybeMissingFile(filePath, fs));
    }

    // Resolve each configured PATH file's real write target up front so two
    // logical paths that alias the same physical file (a dotfiles setup
    // symlinking .bash_profile -> .bashrc) get the PATH block appended once,
    // not once per alias.
    const pathFileTargets = new Map<string, string>();
    for (const filePath of config.pathFiles) {
      pathFileTargets.set(filePath, yield* resolveWriteTarget(filePath, fs));
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

    // Auto-detected mode may skip the PATH write entirely when the bin dir is
    // already reachable; an explicit --shell always configures its files.
    // Only applies to a genuinely fresh install: if any target file already
    // carries our marker from a prior run, a file that appeared since then
    // (e.g. a freshly created .bash_profile) still needs its own write, even
    // though the invoking process's current $PATH already resolves.
    const anyPathFileAlreadyMarked = config.pathFiles.some(filePath =>
      fileContains(existingByFile.get(filePath) ?? '', MARKER)
    );
    const skipPathWriteForReachability =
      !isExplicitShell && binDirOnPath && !anyPathFileAlreadyMarked;
    let pathWritten = false;
    let loginOverrideWritten = false;
    const queuedPathTargets = new Set<string>();
    for (const filePath of config.pathFiles) {
      const existing = existingByFile.get(filePath) ?? '';
      const target = pathFileTargets.get(filePath)!;
      if (
        fileContains(existing, MARKER) ||
        skipPathWriteForReachability ||
        queuedPathTargets.has(target)
      ) {
        continue;
      }
      pushBlock(filePath, config.pathBlock);
      queuedPathTargets.add(target);
      pathWritten = true;
      if (filePath === bashLoginOverride) loginOverrideWritten = true;
    }

    if (pathWritten) {
      yield* step(`PATH: will add ${tildify(binDir, os.homedir)} to $PATH`);
    } else if (skipPathWriteForReachability) {
      yield* step('PATH: already on $PATH — nothing to do.');
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
        yield* replaceFilePreservingMode(writeTarget, existingContents + appendContent, fs);

        yield* success(`Updated ${tildify(filePath, os.homedir)}`);
      }
    } else {
      yield* success('Shell integration already configured — nothing to do.');
    }

    if (blocksByFile.size > 0) {
      if (shell === 'fish') {
        yield* note('exec fish', 'Restart your shell to apply changes');
      } else if (shell === 'zsh') {
        yield* note(
          `source ${tildify(config.pathFiles[0]!, os.homedir)}`,
          'Restart your shell to apply changes'
        );
      } else {
        const bashrc = path.join(os.homedir, '.bashrc');
        const hintLines = [`source ${tildify(bashrc, os.homedir)}`];
        if (loginOverrideWritten && bashLoginOverride) {
          hintLines.push(
            `${tildify(bashLoginOverride, os.homedir)} was also updated — that entry applies to new login shells too.`
          );
        }
        yield* note(hintLines.join('\n'), 'Restart your shell to apply changes');
      }
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
 * composio install --shell zsh
 * ```
 */
export const installCmd = Command.make(
  'install',
  { completions: completionsOpt, noCompletions: noCompletionsOpt, shell: shellOpt },
  ({ completions, noCompletions, shell }) =>
    installShellIntegration({
      completions: completions && !noCompletions,
      shell: Option.getOrUndefined(shell),
    })
).pipe(Command.withDescription('Set up shell integration (PATH and completions).'));
