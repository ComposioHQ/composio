import { Command, Options } from '@effect/cli';
import { FileSystem, Path } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Array as Arr, Config, ConfigProvider, Data, Effect, Option } from 'effect';
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

export type Shell = (typeof SHELLS)[number];

/**
 * Aborted shell setup must fail the process: install.sh only runs its guarded
 * inline PATH fallback when `composio install` exits non-zero, so a successful
 * exit here would leave the user with no PATH setup and a green install. The
 * abort reason is already printed before this error is raised; cli-main.ts
 * maps it to exit code 1 without printing anything further.
 */
export class ShellSetupAbortError extends Data.TaggedError('commands/ShellSetupAbortError')<{
  readonly message: string;
}> {}

interface ShellConfig {
  readonly shell: Shell;
  readonly pathFiles: readonly string[];
  readonly completionFile: string;
  readonly pathLine: string;
  readonly pathBlock: string;
  readonly completionBlock: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MARKER = '# Composio CLI';
const COMPLETIONS_MARKER = '# Composio CLI completions';

/**
 * Reject bin-dir paths that cannot be embedded safely in a managed rc line.
 *
 * The resolved dir is only ever emitted inside double quotes — `export
 * PATH="<dir>:$PATH"` for bash/zsh and `set --export PATH "<dir>" $PATH` for
 * fish — so the set is deliberately narrow:
 *
 * - `` ` ``, `$`, `\`, `"`: the only characters bash and zsh still expand
 *   inside double quotes (`!` history expansion does not apply to sourced
 *   files). fish expands a strict subset of those. Everything else — `;`, `|`,
 *   `&`, `(`, `)`, `'` — is literal there, so a path like
 *   `/Users/o'brien/.composio` is written verbatim rather than rejected.
 * - `\n`, `\r`: structural, not a quoting concern — either would split the
 *   managed block into extra rc lines.
 * - `:`: structural too, as the PATH separator: a dir containing one would
 *   silently prepend more than one entry.
 */
const UNSAFE_PATH_CHARS = /[`$"\\\n\r:]/;
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

const pathLineForShell = (shell: Shell, binDir: string, homedir: string): string => {
  const rendered = renderWithHome(binDir, homedir);
  return shell === 'fish'
    ? `set --export PATH "${rendered}" $PATH`
    : `export PATH="${rendered}:$PATH"`;
};

const pathBlockForShell = (shell: Shell, binDir: string, homedir: string): string =>
  [MARKER, pathLineForShell(shell, binDir, homedir)].join('\n');

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
      // Bash is the only shell here that splits startup files by mode: an
      // interactive non-login shell reads .bashrc, while a login shell (ssh,
      // macOS Terminal.app) reads only its login files. Writing .bashrc alone
      // would leave PATH unset in login shells whenever an override file
      // shadows .profile, so the block lands in both. The override also stays
      // a named value because the restart hint reports it separately.
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
  pathLine: pathLineForShell(shell, binDir, homedir),
  pathBlock: pathBlockForShell(shell, binDir, homedir),
  completionBlock: completionScript ? `${COMPLETIONS_MARKER}\n${completionScript}` : undefined,
});

/** Check whether a file already contains a given marker line. */
const fileContains = (contents: string, marker: string): boolean =>
  contents.split('\n').some(line => line.trim() === marker.trim());

/**
 * Splice the current managed PATH block over the one already in `contents`.
 *
 * The managed block runs from its `# Composio CLI` marker line up to the first
 * blank line, the completions marker, or end of file — the exact layout both
 * this command and install.sh's inline fallback produce, since blocks are
 * always separated by a blank line. That is what lets a legacy three-line block
 * (`export COMPOSIO_INSTALL_DIR=...` plus a PATH line derived from it) be
 * migrated to the current single-line form without touching a completions block
 * further down the file.
 *
 * Returns `None` when the file carries no marker at all, so the caller appends.
 */
const replaceManagedPathBlock = (contents: string, block: string): Option.Option<string> => {
  const lines = contents.split('\n');
  const isBlockEnd = (line: string): boolean =>
    line.trim() === '' || line.trim() === COMPLETIONS_MARKER;

  return Arr.findFirstIndex(lines, line => line.trim() === MARKER).pipe(
    Option.map(markerIndex => {
      const endIndex = Arr.findFirstIndex(Arr.drop(lines, markerIndex + 1), isBlockEnd).pipe(
        Option.map(offset => markerIndex + 1 + offset),
        Option.getOrElse(() => lines.length)
      );
      return Arr.appendAll(
        Arr.appendAll(Arr.take(lines, markerIndex), block.split('\n')),
        Arr.drop(lines, endIndex)
      ).join('\n');
    })
  );
};

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

/**
 * Apply one rc file's queued changes: a stale managed block is spliced in
 * place, everything else is appended at the end.
 */
const applyFileChanges = (params: {
  readonly filePath: string;
  readonly resolvedWriteTarget: Option.Option<string>;
  readonly rewritePathBlock: Option.Option<string>;
  readonly appendBlocks: ReadonlyArray<string>;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    const { filePath, fs, path } = params;

    // Re-read instead of reusing the pre-check snapshot: two configured paths
    // can alias the same physical file through symlinks, and this write must
    // not discard a previous iteration's append.
    const existingContents = yield* readMaybeMissingFile(filePath, fs);
    // PATH files were already resolved by the caller; only the completion file
    // needs a fresh resolve.
    const writeTarget = yield* Option.match(params.resolvedWriteTarget, {
      onNone: () => resolveWriteTarget(filePath, fs),
      onSome: Effect.succeed,
    });

    yield* fs
      .makeDirectory(path.dirname(writeTarget), { recursive: true })
      .pipe(
        Effect.catchAll(e =>
          Effect.logDebug('Could not create parent directory (may already exist):', e)
        )
      );

    const migrated = Option.match(params.rewritePathBlock, {
      onNone: () => existingContents,
      onSome: block =>
        Option.getOrElse(replaceManagedPathBlock(existingContents, block), () => existingContents),
    });
    const contents =
      params.appendBlocks.length > 0
        ? migrated + '\n' + params.appendBlocks.join('\n\n') + '\n'
        : migrated;

    yield* replaceFilePreservingMode(writeTarget, contents, fs);
  });

// ---------------------------------------------------------------------------
// Exported logic (reusable from install.sh post-install delegation)
// ---------------------------------------------------------------------------

export const installShellIntegration = (params: {
  readonly completions: boolean;
  readonly shell?: Shell;
}): Effect.Effect<
  void,
  PlatformError | ShellSetupAbortError,
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
    const execPath = nodeProcess.execPath;
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
      const message = 'Resolved bin directory must be an absolute path.';
      yield* failure(message);
      yield* ui.outro('Aborted.');
      return yield* new ShellSetupAbortError({ message });
    }

    if (isUnsafePath(binDir)) {
      const message =
        'Resolved bin directory contains unsafe characters and cannot be written to shell config.';
      yield* failure(message);
      yield* ui.outro('Aborted.');
      return yield* new ShellSetupAbortError({ message });
    }

    const shellEnv = yield* readEnvWithDefault('SHELL', '');
    const shell = params.shell ?? detectShellFromEnv(path, shellEnv);

    const pathEnv = yield* readEnvWithDefault('PATH', '');
    const binDirOnPath = isDirOnPath(pathEnv, binDir);

    if (!shell) {
      // With no shell there is no rc file to write, so the current process's
      // $PATH is all the evidence available. It says nothing about future
      // shells, hence the deliberately hedged wording.
      if (binDirOnPath) {
        yield* success(
          `PATH: ${tildify(binDir, os.homedir)} is already on $PATH in this process, and no shell config file could be identified — nothing to update.`
        );
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

    // Path files whose existing managed block is stale and must be replaced in
    // place rather than appended to.
    const pathRewrites = new Set<string>();
    let pathWritten = false;
    let loginOverrideWritten = false;
    const queuedPathTargets = new Set<string>();
    for (const filePath of config.pathFiles) {
      const existing = existingByFile.get(filePath) ?? '';
      const target = pathFileTargets.get(filePath)!;
      if (queuedPathTargets.has(target)) continue;
      // The marker alone does not mean "configured": a block written by a
      // pre-`--shell` CLI or by install.sh's inline fallback still carries the
      // legacy `export COMPOSIO_INSTALL_DIR=` pair, and a block written for a
      // different bin dir points shells at the wrong binary. Only the exact
      // rendered line for the resolved bin dir is a no-op.
      if (fileContains(existing, config.pathLine)) continue;
      if (fileContains(existing, MARKER)) {
        pathRewrites.add(filePath);
      } else {
        pushBlock(filePath, config.pathBlock);
      }
      queuedPathTargets.add(target);
      pathWritten = true;
      if (filePath === bashLoginOverride) loginOverrideWritten = true;
    }

    if (pathWritten) {
      yield* step(`PATH: will add ${tildify(binDir, os.homedir)} to $PATH`);
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

    const filesToWrite = [...new Set([...pathRewrites, ...blocksByFile.keys()])];

    if (filesToWrite.length > 0) {
      for (const filePath of filesToWrite) {
        // A stale managed block is replaced where it stands, so the user's own
        // ordering survives; everything else is appended.
        yield* applyFileChanges({
          filePath,
          resolvedWriteTarget: Option.fromNullable(pathFileTargets.get(filePath)),
          rewritePathBlock: pathRewrites.has(filePath)
            ? Option.some(config.pathBlock)
            : Option.none(),
          appendBlocks: blocksByFile.get(filePath) ?? [],
          fs,
          path,
        });

        yield* success(`Updated ${tildify(filePath, os.homedir)}`);
      }
    } else {
      yield* success('Shell integration already configured — nothing to do.');
    }

    if (filesToWrite.length > 0) {
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
 * The directory added to `PATH` is `COMPOSIO_BIN_DIR` when set — the documented
 * override an installer hands to this command — then `~/.local/bin` when its
 * `composio` entry point is this executable, then the running binary's own
 * directory.
 *
 * @example
 * ```bash
 * composio install
 * composio install --completions
 * composio install --no-completions
 * composio install --shell zsh
 * COMPOSIO_BIN_DIR=~/.local/bin composio install
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
).pipe(
  Command.withDescription(
    'Set up shell integration (PATH and completions). Set COMPOSIO_BIN_DIR to choose the directory added to PATH; it otherwise defaults to ~/.local/bin when that holds this executable, and to the directory of the running binary.'
  )
);
