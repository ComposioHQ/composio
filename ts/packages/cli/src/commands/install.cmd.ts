import { Command, Flag } from 'effect/cli';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import { Array as Arr, Config, Data, Effect, Option } from 'effect';
import { APP_CONFIG, HOST_CONFIG } from 'src/config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { getCompletionScript } from 'src/effects/shell-completions';
import {
  BASH_PROFILE_PASSTHROUGH,
  COMPLETIONS_MARKER,
  buildShellConfig,
  detectShellFromEnv,
  fileContains,
  isUnsafePath,
  pathFilesForShell,
  readMaybeMissingFile,
  reconcileManagedPathBlock,
  renderWithHome,
  replaceFilePreservingMode,
  resolveBashLoginFile,
  resolveWriteTarget,
  appendManagedBlocks,
  SHELLS,
  type Shell,
} from 'src/services/shell-config';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const completionsOpt = Flag.Boolean('completions').pipe(
  Flag.withDescription('Install shell completions.'),
  Flag.withDefault(false)
);

const noCompletionsOpt = Flag.Boolean('no-completions').pipe(
  Flag.withDescription('Deprecated: shell completions are skipped by default.'),
  Flag.withDefault(false)
);

const shellOpt = Flag.Literals('shell', SHELLS).pipe(
  Flag.withDescription('Override automatic shell detection.'),
  Flag.optional
);

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

interface ManagedBlockReplacement {
  readonly contents: string;
  readonly displayPath: string;
}

interface PathBlockWritePlan {
  readonly appendPathFiles: readonly string[];
  readonly replacementsByTarget: ReadonlyMap<string, ManagedBlockReplacement>;
  readonly loginOverrideWritten: boolean;
}

/**
 * Decide, per configured PATH file, whether the managed block must be appended
 * (absent), replaced in place (stale bin dir), or left alone (already
 * current). Both appends and replacements are deduplicated by physical write
 * target so two logical paths aliasing the same file (a dotfiles symlink
 * setup) keep exactly one managed block.
 */
const planPathBlockWrites = (params: {
  readonly pathFiles: readonly string[];
  readonly existingByFile: ReadonlyMap<string, string>;
  readonly pathFileTargets: ReadonlyMap<string, string>;
  readonly pathBlock: string;
  readonly bashLoginOverride: string | undefined;
}): PathBlockWritePlan => {
  const appendPathFiles: string[] = [];
  const replacementsByTarget = new Map<string, ManagedBlockReplacement>();
  const queuedPathTargets = new Set<string>();
  let loginOverrideWritten = false;
  for (const filePath of params.pathFiles) {
    const existing = params.existingByFile.get(filePath) ?? '';
    const target = params.pathFileTargets.get(filePath)!;
    const reconciliation = reconcileManagedPathBlock(existing, params.pathBlock);
    if (reconciliation.state === 'stale') {
      if (!replacementsByTarget.has(target)) {
        replacementsByTarget.set(target, {
          contents: reconciliation.reconciled,
          displayPath: filePath,
        });
        if (filePath === params.bashLoginOverride) loginOverrideWritten = true;
      }
      continue;
    }
    // Only a byte-exact current block is a no-op. A `$PATH` that already
    // resolves in the invoking process is deliberately not a reason to skip:
    // it is transient evidence that says nothing about future shells.
    if (reconciliation.state === 'current' || queuedPathTargets.has(target)) {
      continue;
    }
    appendPathFiles.push(filePath);
    queuedPathTargets.add(target);
    if (filePath === params.bashLoginOverride) loginOverrideWritten = true;
  }
  return { appendPathFiles, replacementsByTarget, loginOverrideWritten };
};

/** Append each file's queued blocks in one atomic, mode-preserving rewrite per file. */
const appendQueuedBlocks = (params: {
  readonly blocksByFile: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly pathFileTargets: ReadonlyMap<string, string>;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly homedir: string;
  readonly report: (message: string) => Effect.Effect<void>;
}): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    const { fs, path } = params;
    for (const [filePath, blocks] of params.blocksByFile.entries()) {
      // Re-read instead of reusing the pre-check snapshot: two configured paths
      // can alias the same physical file through symlinks, and this write must
      // not discard a previous iteration's append.
      const existingContents = yield* readMaybeMissingFile(filePath, fs);
      // PATH files were already resolved by the caller; only the completion
      // file needs a fresh resolve.
      const writeTarget =
        params.pathFileTargets.get(filePath) ?? (yield* resolveWriteTarget(filePath, fs));

      yield* fs
        .makeDirectory(path.dirname(writeTarget), { recursive: true })
        .pipe(
          Effect.catch(e =>
            Effect.logDebug('Could not create parent directory (may already exist):', e)
          )
        );

      yield* replaceFilePreservingMode(
        fs,
        writeTarget,
        appendManagedBlocks(existingContents, blocks)
      );
      yield* params.report(`Updated ${tildify(filePath, params.homedir)}`);
    }
  });

/** Atomically rewrite each reconciled physical target, preserving its file mode. */
const writeReconciledTargets = (params: {
  readonly replacementsByTarget: ReadonlyMap<string, ManagedBlockReplacement>;
  readonly fs: FileSystem.FileSystem;
  readonly homedir: string;
  readonly report: (message: string) => Effect.Effect<void>;
}): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    for (const [writeTarget, replacement] of params.replacementsByTarget.entries()) {
      yield* replaceFilePreservingMode(params.fs, writeTarget, replacement.contents);
      yield* params.report(`Updated ${tildify(replacement.displayPath, params.homedir)}`);
    }
  });

/** Completion status line, plus whether the completion block still needs appending. */
const planCompletionWrite = (params: {
  readonly shell: Shell;
  readonly completionsRequested: boolean;
  readonly completionBlock: string | undefined;
  readonly completionFile: string;
  readonly existingCompletionFile: string;
  readonly homedir: string;
}): { readonly statusLine: string; readonly append: boolean } => {
  if (params.shell === 'zsh') {
    return { statusLine: 'Completions: skipped for zsh', append: false };
  }
  if (!params.completionsRequested) {
    return {
      statusLine: 'Completions: skipped by default (pass --completions to enable)',
      append: false,
    };
  }
  if (!params.completionBlock) {
    return { statusLine: 'Completions: not available for this shell', append: false };
  }
  if (fileContains(params.existingCompletionFile, COMPLETIONS_MARKER)) {
    return { statusLine: 'Completions: already configured', append: false };
  }
  return {
    statusLine:
      params.shell === 'fish'
        ? `Completions: will install fish completions to ${tildify(params.completionFile, params.homedir)}`
        : 'Completions: will install shell completions',
    append: true,
  };
};

/** Status lines summarizing the planned PATH work, in print order. */
const pathStatusLines = (params: {
  readonly pathWritten: boolean;
  readonly pathReplaced: boolean;
  readonly renderedBinDir: string;
}): readonly string[] => {
  const lines: string[] = [];
  if (params.pathWritten) lines.push(`PATH: will add ${params.renderedBinDir} to $PATH`);
  if (params.pathReplaced) {
    lines.push(`PATH: will update the managed block to ${params.renderedBinDir}`);
  }
  if (lines.length === 0) lines.push('PATH: already configured');
  return lines;
};

/** Shell-specific body of the restart hint printed after a change. */
const restartHintBody = (params: {
  readonly shell: Shell;
  readonly zshPathFile: string;
  readonly bashrc: string;
  readonly bashLoginOverride: string | undefined;
  readonly loginOverrideWritten: boolean;
  readonly homedir: string;
}): string => {
  switch (params.shell) {
    case 'fish':
      return 'exec fish';
    case 'zsh':
      return `source ${tildify(params.zshPathFile, params.homedir)}`;
    case 'bash': {
      const hintLines = [`source ${tildify(params.bashrc, params.homedir)}`];
      if (params.loginOverrideWritten && params.bashLoginOverride) {
        hintLines.push(
          `${tildify(params.bashLoginOverride, params.homedir)} was also updated — that entry applies to new login shells too.`
        );
      }
      return hintLines.join('\n');
    }
  }
};

const tildify = (p: string, homedir: string): string =>
  p.startsWith(homedir + '/') ? `~/${p.slice(homedir.length + 1)}` : p;

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
    const envBinDir = yield* APP_CONFIG.BIN_DIR.pipe(Effect.orDie);
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

    // The installer owns the closing message: when install.sh delegates to
    // this command it passes COMPOSIO_CLI_INVOCATION_ORIGIN=installer and
    // prints the final action block itself. Keep the concise per-file status
    // lines but suppress the boxed restart hint so the CLI never prints a
    // competing instruction.
    const invocationOrigin = yield* APP_CONFIG.CLI_INVOCATION_ORIGIN.pipe(Effect.orDie);
    const installerOwnsFinalMessaging = invocationOrigin === 'installer';

    const host = yield* Effect.orDie(
      Config.all({ shell: HOST_CONFIG.SHELL, path: HOST_CONFIG.PATH })
    );
    const shell = params.shell ?? Option.getOrUndefined(detectShellFromEnv(path, host.shell ?? ''));
    const binDirOnPath = isDirOnPath(host.path ?? '', binDir);

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

    const bashLoginFile =
      shell === 'bash' ? yield* resolveBashLoginFile(path, os.homedir, fs) : undefined;
    const bashLoginOverride = bashLoginFile?.file;
    const pathFiles = pathFilesForShell(path, shell, os.homedir, bashLoginOverride);
    const config = buildShellConfig(
      path,
      shell,
      pathFiles,
      binDir,
      Option.fromUndefinedOr(completionScript),
      os.homedir
    );

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

    const writePlan = planPathBlockWrites({
      pathFiles: config.pathFiles,
      existingByFile,
      pathFileTargets,
      pathBlock: config.pathBlock,
      bashLoginOverride,
    });
    const { replacementsByTarget, loginOverrideWritten } = writePlan;
    // A `.bash_profile` created here takes over from an existing `~/.profile`,
    // so it leads with the passthrough that keeps sourcing it.
    if (
      bashLoginFile?.seedsProfilePassthrough === true &&
      writePlan.appendPathFiles.includes(bashLoginFile.file)
    ) {
      pushBlock(bashLoginFile.file, BASH_PROFILE_PASSTHROUGH);
    }
    for (const filePath of writePlan.appendPathFiles) {
      pushBlock(filePath, config.pathBlock);
    }
    const pathWritten = writePlan.appendPathFiles.length > 0;

    yield* Effect.forEach(
      pathStatusLines({
        pathWritten,
        pathReplaced: replacementsByTarget.size > 0,
        renderedBinDir: tildify(binDir, os.homedir),
      }),
      step
    );

    const completionWrite = planCompletionWrite({
      shell,
      completionsRequested: params.completions,
      completionBlock: Option.getOrUndefined(config.completionBlock),
      completionFile: config.completionFile,
      existingCompletionFile: existingByFile.get(config.completionFile) ?? '',
      homedir: os.homedir,
    });
    const completionBlock = Option.getOrUndefined(config.completionBlock);
    if (completionWrite.append && completionBlock) {
      pushBlock(config.completionFile, completionBlock);
    }
    yield* step(completionWrite.statusLine);

    // Reconcile stale managed blocks first so any completion append below
    // (which re-reads from disk) lands on top of the replaced contents.
    yield* writeReconciledTargets({
      replacementsByTarget,
      fs,
      homedir: os.homedir,
      report: success,
    });

    yield* appendQueuedBlocks({
      blocksByFile,
      pathFileTargets,
      fs,
      path,
      homedir: os.homedir,
      report: success,
    });

    const changesWritten = blocksByFile.size > 0 || replacementsByTarget.size > 0;
    if (!changesWritten) {
      yield* success('Shell integration already configured — nothing to do.');
    }

    if (changesWritten && !installerOwnsFinalMessaging) {
      yield* note(
        restartHintBody({
          shell,
          zshPathFile: config.pathFiles[0]!,
          bashrc: path.join(os.homedir, '.bashrc'),
          bashLoginOverride,
          loginOverrideWritten,
          homedir: os.homedir,
        }),
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
