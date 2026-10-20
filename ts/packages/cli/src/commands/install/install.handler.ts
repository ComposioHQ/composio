import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import { Array as Arr, Config, Effect, Option } from 'effect';
import { APP_CONFIG, HOST_CONFIG } from 'src/config';
import { getCompletionScript } from 'src/effects/shell-completions';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import {
  BASH_PROFILE_PASSTHROUGH,
  COMPLETIONS_MARKER,
  appendManagedBlocks,
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
  type Shell,
} from 'src/services/shell-config';
import { TerminalUI } from 'src/services/terminal-ui';
import { ShellSetupAbortError } from './install.errors';
import {
  ABORTED_OUTRO,
  ALREADY_CONFIGURED_MESSAGE,
  BIN_DIR_NOT_ABSOLUTE_MESSAGE,
  BIN_DIR_UNSAFE_MESSAGE,
  CompletionPlan,
  DONE_OUTRO,
  INSTALL_INTRO,
  MANUAL_PATH_SETUP_TITLE,
  MANUAL_SETUP_OUTRO,
  RESTART_HINT_TITLE,
  SHELL_NOT_DETECTED_MESSAGE,
  alreadyOnPathMessage,
  completionStatusLine,
  detectedShellMessage,
  makeInstallReporter,
  manualPathSetupLine,
  pathStatusLines,
  restartHintBody,
  tildify,
  updatedFileMessage,
  type InstallReporter,
} from './install.format';

/** The flags of `composio install`. */
export type InstallParams = {
  readonly completions: boolean;
  readonly noCompletions: boolean;
  readonly shell: Option.Option<Shell>;
};

type InstallRequirements =
  TerminalUI | NodeOs | NodeProcess | FileSystem.FileSystem | Path.Path | ComposioCliUserConfig;

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
}): string =>
  Option.fromUndefinedOr(params.envBinDir).pipe(
    Option.map(dir => dir.trim()),
    Option.filter(dir => dir.length > 0),
    Option.getOrElse(() =>
      params.localBinComposioIsCurrentExecutable
        ? params.localBinDir
        : params.path.dirname(params.execPath)
    )
  );

/** A bin dir that cannot go into an rc file, and why; checked in this order. */
const UNUSABLE_BIN_DIR_CHECKS: ReadonlyArray<{
  readonly rejects: (path: Path.Path, binDir: string) => boolean;
  readonly message: string;
}> = [
  { rejects: (path, binDir) => !path.isAbsolute(binDir), message: BIN_DIR_NOT_ABSOLUTE_MESSAGE },
  { rejects: (_, binDir) => isUnsafePath(binDir), message: BIN_DIR_UNSAFE_MESSAGE },
];

const unusableBinDirReason = (path: Path.Path, binDir: string): Option.Option<string> =>
  Arr.findFirst(UNUSABLE_BIN_DIR_CHECKS, check => check.rejects(path, binDir)).pipe(
    Option.map(check => check.message)
  );

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

/** Whether the completion block is appended, and if not, why. */
const planCompletionWrite = (params: {
  readonly shell: Shell;
  readonly completionsRequested: boolean;
  readonly completionBlock: Option.Option<string>;
  readonly existingCompletionFile: string;
}): CompletionPlan => {
  if (params.shell === 'zsh') return CompletionPlan.SkippedForZsh();
  if (!params.completionsRequested) return CompletionPlan.NotRequested();
  return Option.match(params.completionBlock, {
    onNone: () => CompletionPlan.Unavailable(),
    onSome: block =>
      fileContains(params.existingCompletionFile, COMPLETIONS_MARKER)
        ? CompletionPlan.AlreadyConfigured()
        : CompletionPlan.Install({ block }),
  });
};

/** Blocks to append, grouped by file in first-queued order. */
const groupBlocksByFile = (
  queued: ReadonlyArray<readonly [file: string, block: string]>
): ReadonlyMap<string, ReadonlyArray<string>> =>
  Arr.reduce(queued, new Map<string, ReadonlyArray<string>>(), (byFile, [file, block]) =>
    byFile.set(file, [...(byFile.get(file) ?? []), block])
  );

/** Each file mapped to what `f` resolves for it, read one file at a time. */
const mapFiles = <A>(
  files: ReadonlyArray<string>,
  f: (file: string) => Effect.Effect<A, PlatformError>
): Effect.Effect<ReadonlyMap<string, A>, PlatformError> =>
  Effect.forEach(files, file => Effect.map(f(file), value => [file, value] as const)).pipe(
    Effect.map(entries => new Map(entries))
  );

/** Append each file's queued blocks in one atomic, mode-preserving rewrite per file. */
const appendQueuedBlocks = (params: {
  readonly blocksByFile: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly pathFileTargets: ReadonlyMap<string, string>;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly report: (filePath: string) => Effect.Effect<void>;
}): Effect.Effect<void, PlatformError> =>
  Effect.forEach(
    params.blocksByFile,
    ([filePath, blocks]) =>
      Effect.gen(function* () {
        const { fs, path } = params;
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
        yield* params.report(filePath);
      }),
    { discard: true }
  );

/** Atomically rewrite each reconciled physical target, preserving its file mode. */
const writeReconciledTargets = (params: {
  readonly replacementsByTarget: ReadonlyMap<string, ManagedBlockReplacement>;
  readonly fs: FileSystem.FileSystem;
  readonly report: (filePath: string) => Effect.Effect<void>;
}): Effect.Effect<void, PlatformError> =>
  Effect.forEach(
    params.replacementsByTarget,
    ([writeTarget, replacement]) =>
      replaceFilePreservingMode(params.fs, writeTarget, replacement.contents).pipe(
        Effect.andThen(params.report(replacement.displayPath))
      ),
    { discard: true }
  );

/**
 * The completion script for `shell`, when the generator produces one. The root
 * command is imported lazily to avoid a circular dependency
 * (index.ts → install.cmd.ts → install.handler.ts → index.ts).
 */
const generateCompletionScript = (shell: Shell) =>
  Effect.gen(function* () {
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
    return Arr.match(lines, {
      onEmpty: () => Option.none<string>(),
      onNonEmpty: nonEmpty => Option.some(Arr.join(nonEmpty, '\n')),
    });
  });

/** Prints the abort reason, then fails so the process exits 1 and install.sh falls back. */
const abortShellSetup = (report: InstallReporter, message: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* report.failure(message);
    yield* ui.outro(ABORTED_OUTRO);
    return yield* new ShellSetupAbortError({ message });
  });

/** No shell, so no rc file: either the bin dir is already on `$PATH`, or the user adds it. */
const reportUndetectedShell = (params: {
  readonly report: InstallReporter;
  readonly binDir: string;
  readonly binDirOnPath: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const os = yield* NodeOs;
    if (params.binDirOnPath) {
      yield* params.report.success(alreadyOnPathMessage(params.binDir, os.homedir));
      yield* ui.outro(DONE_OUTRO);
      return;
    }
    yield* params.report.warn(SHELL_NOT_DETECTED_MESSAGE);
    yield* params.report.note(
      manualPathSetupLine(renderWithHome(params.binDir, os.homedir)),
      MANUAL_PATH_SETUP_TITLE
    );
    yield* ui.outro(MANUAL_SETUP_OUTRO);
  });

/** Writes the PATH block (and completions, when asked) into `shell`'s startup files. */
const configureShell = (params: {
  readonly shell: Shell;
  readonly binDir: string;
  readonly completions: boolean;
  readonly installerOwnsFinalMessaging: boolean;
  readonly report: InstallReporter;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const os = yield* NodeOs;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { shell, binDir, report } = params;
    const homedir = os.homedir;

    yield* report.step(detectedShellMessage(shell));

    const completionScript = yield* generateCompletionScript(shell).pipe(
      Effect.when(Effect.succeed(params.completions && shell !== 'zsh')),
      Effect.map(Option.flatten)
    );

    const bashLoginFile = yield* Effect.when(
      resolveBashLoginFile(path, homedir, fs),
      Effect.succeed(shell === 'bash')
    );
    const bashLoginOverride = Option.getOrUndefined(Option.map(bashLoginFile, f => f.file));
    const pathFiles = pathFilesForShell(path, shell, homedir, bashLoginOverride);
    const config = buildShellConfig(path, shell, pathFiles, binDir, completionScript, homedir);

    const existingByFile = yield* mapFiles(
      Arr.dedupe([...config.pathFiles, config.completionFile]),
      filePath => readMaybeMissingFile(filePath, fs)
    );

    // Resolve each configured PATH file's real write target up front so two
    // logical paths that alias the same physical file (a dotfiles setup
    // symlinking .bash_profile -> .bashrc) get the PATH block appended once,
    // not once per alias.
    const pathFileTargets = yield* mapFiles(config.pathFiles, filePath =>
      resolveWriteTarget(filePath, fs)
    );

    const writePlan = planPathBlockWrites({
      pathFiles: config.pathFiles,
      existingByFile,
      pathFileTargets,
      pathBlock: config.pathBlock,
      bashLoginOverride,
    });
    const completionPlan = planCompletionWrite({
      shell,
      completionsRequested: params.completions,
      completionBlock: config.completionBlock,
      existingCompletionFile: existingByFile.get(config.completionFile) ?? '',
    });

    const blocksByFile = groupBlocksByFile([
      // A `.bash_profile` created here takes over from an existing `~/.profile`,
      // so it leads with the passthrough that keeps sourcing it.
      ...Arr.fromOption(
        bashLoginFile.pipe(
          Option.filter(
            loginFile =>
              loginFile.seedsProfilePassthrough &&
              writePlan.appendPathFiles.includes(loginFile.file)
          ),
          Option.map(loginFile => [loginFile.file, BASH_PROFILE_PASSTHROUGH] as const)
        )
      ),
      ...writePlan.appendPathFiles.map(filePath => [filePath, config.pathBlock] as const),
      ...Arr.fromOption(
        Option.liftPredicate(completionPlan, CompletionPlan.$is('Install')).pipe(
          Option.map(({ block }) => [config.completionFile, block] as const)
        )
      ),
    ]);

    yield* Effect.forEach(
      pathStatusLines({
        pathWritten: writePlan.appendPathFiles.length > 0,
        pathReplaced: writePlan.replacementsByTarget.size > 0,
        renderedBinDir: tildify(binDir, homedir),
      }),
      report.step,
      { discard: true }
    );
    yield* report.step(
      completionStatusLine(completionPlan, {
        shell,
        completionFile: config.completionFile,
        homedir,
      })
    );

    const reportUpdated = (filePath: string) =>
      report.success(updatedFileMessage(filePath, homedir));

    // Reconcile stale managed blocks first so any completion append below
    // (which re-reads from disk) lands on top of the replaced contents.
    yield* writeReconciledTargets({
      replacementsByTarget: writePlan.replacementsByTarget,
      fs,
      report: reportUpdated,
    });
    yield* appendQueuedBlocks({ blocksByFile, pathFileTargets, fs, path, report: reportUpdated });

    const changesWritten = blocksByFile.size > 0 || writePlan.replacementsByTarget.size > 0;
    yield* Effect.when(report.success(ALREADY_CONFIGURED_MESSAGE), Effect.succeed(!changesWritten));
    yield* Effect.when(
      report.note(
        restartHintBody({
          shell,
          zshPathFile: config.pathFiles[0]!,
          bashrc: path.join(homedir, '.bashrc'),
          bashLoginOverride,
          loginOverrideWritten: writePlan.loginOverrideWritten,
          homedir,
        }),
        RESTART_HINT_TITLE
      ),
      Effect.succeed(changesWritten && !params.installerOwnsFinalMessaging)
    );

    yield* ui.outro(DONE_OUTRO);
  });

/**
 * Sets up shell integration: adds the resolved bin dir to `PATH` in the
 * detected (or given) shell's startup files and, when asked, installs
 * completions. install.sh runs it after installing the binary.
 */
export const installShellIntegration = (params: {
  readonly completions: boolean;
  readonly shell?: Shell;
}): Effect.Effect<void, PlatformError | ShellSetupAbortError, InstallRequirements> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const os = yield* NodeOs;
    const nodeProcess = yield* NodeProcess;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const { canDecorate } = yield* ui.capabilities;
    const report = makeInstallReporter(ui, canDecorate);

    yield* ui.intro(INSTALL_INTRO);

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

    yield* Option.match(unusableBinDirReason(path, binDir), {
      onNone: () => Effect.void,
      onSome: message => abortShellSetup(report, message),
    });

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
    const shell = Option.fromUndefinedOr(params.shell).pipe(
      Option.orElse(() => detectShellFromEnv(path, host.shell ?? ''))
    );

    yield* Option.match(shell, {
      onNone: () =>
        reportUndetectedShell({
          report,
          binDir,
          binDirOnPath: isDirOnPath(host.path ?? '', binDir),
        }),
      onSome: detected =>
        configureShell({
          shell: detected,
          binDir,
          completions: params.completions,
          installerOwnsFinalMessaging,
          report,
        }),
    });
  });

/** `--no-completions` wins over `--completions`. */
export const runInstall = ({ completions, noCompletions, shell }: InstallParams) =>
  installShellIntegration({
    completions: completions && !noCompletions,
    shell: Option.getOrUndefined(shell),
  });
